import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, createAuthUser, asUserInTx, type Db, type Fixture } from './helpers';

/**
 * Chaque case de « Rôles et droits » agit seule, dans la base (migration 0059).
 *
 * Avant 0059, l'étape clé de quatre circuits dépendait d'un droit plus large :
 * clôturer une évaluation exigeait de pouvoir la MODIFIER, un enseignant publiait
 * ses notes sans « Publier les notes », « Gérer les années » suffisait à clôturer,
 * « Modifier l'emploi du temps » à le publier. Une annonce pouvait naître publiée
 * avec le seul droit de rédiger, et les coordonnées des enseignants se lisaient
 * sans « Voir les enseignants ».
 *
 * Chaque personne de test reçoit une fonction sur mesure, qui ne contient QUE les
 * droits nommés : c'est exactement ce que produit une case cochée ou décochée.
 * Tout se passe dans UNE transaction annulée : rien n'est jamais validé en base.
 */

let db: Db;
let f: Fixture;
const people: Record<string, string> = {};
let versionId: string;

type Attempt = { rowCount: number } | { denied: string };

async function attempt(tx: Db, sql: string, params: unknown[] = []): Promise<Attempt> {
  await tx.query('savepoint attempt');
  try {
    const r = await tx.query(sql, params);
    await tx.query('release savepoint attempt');
    return { rowCount: r.rowCount ?? 0 };
  } catch (error) {
    await tx.query('rollback to savepoint attempt');
    return { denied: (error as { code?: string }).code ?? 'ERR' };
  }
}

/** Personne dotée d'une fonction propre à l'établissement A, avec ces seuls droits. */
async function personWith(tag: string, permissions: string[]): Promise<string> {
  const userId = await createAuthUser(db, `rlstest-a-${tag}@accounts.invalid`);
  const membership = await db.query(
    `insert into school_memberships (school_id, user_id, status) values ($1, $2, 'ACTIVE') returning id`,
    [f.a.schoolId, userId],
  );
  const role = await db.query(
    `insert into roles (school_id, code, name, is_system) values ($1, $2, $2, false) returning id`,
    [f.a.schoolId, `TEST_${tag.toUpperCase()}`],
  );
  await db.query(
    `insert into role_permissions (role_id, permission_id) select $1, id from permissions where code = any($2)`,
    [role.rows[0].id, permissions],
  );
  await db.query(`insert into membership_roles (membership_id, role_id) values ($1, $2)`, [membership.rows[0].id, role.rows[0].id]);
  return userId;
}

const as = (who: string, sql: string, params: unknown[] = []) =>
  asUserInTx(db, people[who] ?? who, (tx) => attempt(tx, sql, params));

beforeAll(async () => {
  db = await connect();
  await db.query('begin');
  f = await seedFixture(db);

  people.valideur = await personWith('valideur', ['assessments.view', 'grades.view_all', 'grades.validate']);
  people.publieur = await personWith('publieur', ['assessments.view', 'grades.view_all', 'grades.publish']);
  people.gestionAnnee = await personWith('gestionannee', ['academic_years.view', 'academic_years.manage']);
  people.clotureAnnee = await personWith('clotureannee', ['academic_years.view', 'academic_years.close']);
  people.publieEdt = await personWith('publieedt', ['schedule.view', 'schedule.view_all', 'schedule.publish']);
  people.modifieEdt = await personWith('modifieedt', ['schedule.view', 'schedule.view_all', 'schedule.update']);
  people.redacteur = await personWith('redacteur', ['announcements.view', 'announcements.create']);
  people.diffuseur = await personWith('diffuseur', ['announcements.view', 'announcements.create', 'announcements.publish']);
  people.surveillant = await personWith('surveillant', ['classes.view', 'schedule.view', 'schedule.view_all', 'attendance.view_all']);
  people.rh = await personWith('rh', ['teachers.view']);

  const version = await db.query(
    `insert into schedule_versions (school_id, academic_year_id, number, name, status)
     values ($1, $2, 99, 'Version de test', 'VALIDATED') returning id`,
    [f.a.schoolId, f.a.yearId],
  );
  versionId = version.rows[0].id as string;
}, 120_000);

afterAll(async () => {
  if (db) {
    try {
      await db.query('rollback');
    } finally {
      await db.end();
    }
  }
});

// L'évaluation du jeu de données (f.a.assessmentId) est CLOSED et appartient à f.a.teacherId.
const setStatus = 'update assessments set status = $2::assessment_status where id = $1';
const reopen = `update assessments set status = 'DRAFT', published_at = null where id = $1`;

describe('Évaluations : valider et publier sont deux droits', () => {
  it('« Valider les notes » seul suffit à rouvrir puis clôturer', async () => {
    expect(await as('valideur', reopen, [f.a.assessmentId])).toEqual({ rowCount: 1 });
  });

  it('« Valider les notes » ne permet pas de publier', async () => {
    expect(await as('valideur', setStatus, [f.a.assessmentId, 'PUBLISHED'])).toEqual({ denied: '42501' });
  });

  it('« Valider les notes » ne permet pas de modifier le contenu', async () => {
    expect(await as('valideur', 'update assessments set title = $2 where id = $1', [f.a.assessmentId, 'X'])).toEqual({ denied: '42501' });
  });

  it('« Publier les notes » seul suffit à publier', async () => {
    expect(await as('publieur', setStatus, [f.a.assessmentId, 'PUBLISHED'])).toEqual({ rowCount: 1 });
  });

  it("l'enseignant propriétaire, sans « Publier les notes », ne publie pas", async () => {
    expect(await as(f.a.teacherUserId, setStatus, [f.a.assessmentId, 'PUBLISHED'])).toEqual({ denied: '42501' });
  });

  it("l'enseignant propriétaire, sans « Valider les notes », ne rouvre pas une évaluation clôturée", async () => {
    expect(await as(f.a.teacherUserId, reopen, [f.a.assessmentId])).toEqual({ denied: '42501' });
  });
});

describe('Années scolaires : gérer, clôturer, rouvrir', () => {
  const close = `update academic_years set status = 'CLOSED', is_current = false where id = $1`;

  it('« Clôturer » seul suffit à clôturer', async () => {
    expect(await as('clotureAnnee', close, [f.a.yearId])).toEqual({ rowCount: 1 });
  });

  it('« Gérer » sans « Clôturer » ne clôture pas', async () => {
    expect(await as('gestionAnnee', close, [f.a.yearId])).toEqual({ denied: '42501' });
  });

  it('« Clôturer » seul ne renomme pas', async () => {
    expect(await as('clotureAnnee', `update academic_years set name = 'X' where id = $1`, [f.a.yearId])).toEqual({ denied: '42501' });
  });
});

describe("Emploi du temps : modifier n'est pas publier", () => {
  const publish = `update schedule_versions set status = 'PUBLISHED', published_at = now() where id = $1`;

  it('« Publier » seul suffit à publier', async () => {
    expect(await as('publieEdt', publish, [versionId])).toEqual({ rowCount: 1 });
  });

  it('« Modifier » sans « Publier » ne publie pas', async () => {
    expect(await as('modifieEdt', publish, [versionId])).toEqual({ denied: '42501' });
  });

  it('« Publier » seul ne renomme pas la version', async () => {
    expect(await as('publieEdt', `update schedule_versions set name = 'X' where id = $1`, [versionId])).toEqual({ denied: '42501' });
  });
});

describe("Annonces : rédiger n'est pas publier", () => {
  const insert = (status: string) =>
    `insert into announcements (school_id, title, body, status, author_id)
     values ($1, 'Titre', 'Texte', '${status}', auth.uid())`;

  it('« Rédiger » crée un brouillon', async () => {
    expect(await as('redacteur', insert('DRAFT'), [f.a.schoolId])).toEqual({ rowCount: 1 });
  });

  it('« Rédiger » sans « Publier » ne crée pas une annonce déjà publiée', async () => {
    expect(await as('redacteur', insert('PUBLISHED'), [f.a.schoolId])).toEqual({ denied: '42501' });
  });

  it('« Publier » le permet', async () => {
    expect(await as('diffuseur', insert('PUBLISHED'), [f.a.schoolId])).toEqual({ rowCount: 1 });
  });
});

describe('Enseignants : le nom pour le travail, les coordonnées pour « Voir les enseignants »', () => {
  it('sans ce droit, le nom reste lisible (classes, emploi du temps, présences)', async () => {
    expect(await as('surveillant', 'select last_name from teachers where id = $1', [f.a.teacherId])).toEqual({ rowCount: 1 });
  });

  it('sans ce droit, le téléphone ne se lit pas', async () => {
    expect(await as('surveillant', 'select phone_e164 from teachers where id = $1', [f.a.teacherId])).toEqual({ denied: '42501' });
  });

  it('sans ce droit, teacher_contacts ne rend rien', async () => {
    expect(await as('surveillant', 'select * from teacher_contacts($1)', [f.a.schoolId])).toEqual({ rowCount: 0 });
  });

  it('avec ce droit, teacher_contacts rend les coordonnées', async () => {
    expect(await as('rh', 'select * from teacher_contacts($1, array[$2]::uuid[])', [f.a.schoolId, f.a.teacherId])).toEqual({ rowCount: 1 });
  });

  it("l'enseignant lit ses propres coordonnées", async () => {
    expect(await as(f.a.teacherUserId, 'select * from teacher_contacts($1, array[$2]::uuid[])', [f.a.schoolId, f.a.teacherId])).toEqual({ rowCount: 1 });
  });

  it("l'établissement B ne lit pas les coordonnées de A", async () => {
    expect(await as(f.b.adminUserId, 'select * from teacher_contacts($1)', [f.a.schoolId])).toEqual({ rowCount: 0 });
  });
});
