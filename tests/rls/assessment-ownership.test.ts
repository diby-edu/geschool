import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, createAuthUser, addMember, asUserInTx, type Db, type Fixture } from './helpers';

/**
 * Un enseignant agit sur SES evaluations, jamais sur celles d'un collegue
 * (docs/RBAC.md §6, commentaire de 0021).
 *
 * Avant 0051, le role TEACHER detenait `assessments.update`, `assessments.delete`
 * et `grades.create` ; comme `app.has_permission` ignore la portee, ces droits
 * valaient pour TOUTE l'ecole et un collegue pouvait modifier, supprimer et noter
 * dans l'evaluation d'un autre. Ces scenarios verrouillent la correction.
 *
 * Tout se passe dans UNE transaction annulee en bloc : le jeu de donnees, les
 * comptes et les ecritures ne sont jamais valides en base, meme si un test
 * s'interrompt ou si la suite tourne contre une base partagee.
 */

let db: Db;
let f: Fixture;
let colleagueSameClass: string; // enseignant d'une autre matiere, dans la MEME classe
let colleagueOtherClass: string; // enseignant sans lien avec la classe
let directorUserId: string;
let draftId: string; // brouillon du proprietaire, sans note

type Attempt = { rowCount: number } | { denied: string };

/** Ecriture isolee par un savepoint : un refus (42501) n'annule pas la transaction. */
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

async function addTeacher(tag: string, opts: { sameClass: boolean }): Promise<string> {
  const a = f.a;
  const userId = await createAuthUser(db, `rlstest-a-${tag}@accounts.invalid`);
  await addMember(db, a.schoolId, userId, 'TEACHER');
  const teacher = await db.query(
    `insert into teachers (school_id, user_id, staff_number, first_name, last_name)
     values ($1, $2, $3, 'Collegue', $4) returning id`,
    [a.schoolId, userId, `ENS-${tag}`, tag],
  );
  if (opts.sameClass) {
    const subject = await db.query(
      `insert into subjects (school_id, code, name) values ($1, $2, $3) returning id`,
      [a.schoolId, `S-${tag}`.toUpperCase(), `Matiere ${tag}`],
    );
    await db.query(
      `insert into teaching_assignments (school_id, academic_year_id, teacher_id, subject_id, class_id, weekly_minutes)
       values ($1, $2, $3, $4, $5, 120)`,
      [a.schoolId, a.yearId, teacher.rows[0].id, subject.rows[0].id, a.classId],
    );
  }
  return userId;
}

beforeAll(async () => {
  db = await connect();
  await db.query('begin');
  f = await seedFixture(db);

  colleagueSameClass = await addTeacher('memeclasse', { sameClass: true });
  colleagueOtherClass = await addTeacher('autreclasse', { sameClass: false });

  directorUserId = await createAuthUser(db, 'rlstest-a-directeur@accounts.invalid');
  await addMember(db, f.a.schoolId, directorUserId, 'DIRECTOR');

  // Brouillon du proprietaire (f.a.teacherId), copie de l'evaluation du jeu de donnees.
  const draft = await db.query(
    `insert into assessments (school_id, academic_year_id, academic_period_id, subject_id, class_id, teacher_id,
                              assessment_type_id, title, grading_scale_id, max_score, status)
     select school_id, academic_year_id, academic_period_id, subject_id, class_id, teacher_id,
            assessment_type_id, 'Devoir en cours', grading_scale_id, max_score, 'DRAFT'
     from assessments where id = $1
     returning id`,
    [f.a.assessmentId],
  );
  draftId = draft.rows[0].id as string;
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

const updateTitle = 'update assessments set title = $2 where id = $1';
const deleteOne = 'delete from assessments where id = $1';
const insertGrade = 'insert into grades (school_id, assessment_id, student_id, score) values ($1, $2, $3, 12)';

// ---------------------------------------------------------------------------

describe('Droits du role Enseignant (0051)', () => {
  it('aucun role TEACHER, modele ou copie d etablissement, ne porte un droit general sur les evaluations', async () => {
    const { rows } = await db.query(
      `select r.school_id, p.code
       from roles r
       join role_permissions rp on rp.role_id = r.id
       join permissions p on p.id = rp.permission_id
       where r.code = 'TEACHER'
         and p.code in ('assessments.update', 'assessments.delete', 'grades.create')`,
    );
    expect(rows).toEqual([]);
  });

  it('le modele TEACHER garde assessments.create : un enseignant doit pouvoir creer', async () => {
    const { rows } = await db.query(
      `select 1
       from roles r
       join role_permissions rp on rp.role_id = r.id
       join permissions p on p.id = rp.permission_id
       where r.school_id is null and r.code = 'TEACHER' and p.code = 'assessments.create'`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe('Le proprietaire garde la main sur SON evaluation', () => {
  it('la modifie', async () => {
    const r = await asUserInTx(db, f.a.teacherUserId, (tx) => attempt(tx, updateTitle, [draftId, 'Titre modifie']));
    expect(r).toEqual({ rowCount: 1 });
  });

  it('y saisit des notes', async () => {
    const r = await asUserInTx(db, f.a.teacherUserId, (tx) => attempt(tx, insertGrade, [f.a.schoolId, draftId, f.a.otherStudentId]));
    expect(r).toEqual({ rowCount: 1 });
  });

  it('la supprime', async () => {
    const r = await asUserInTx(db, f.a.teacherUserId, (tx) => attempt(tx, deleteOne, [draftId]));
    expect(r).toEqual({ rowCount: 1 });
  });
});

describe.each([
  ['un collegue de la MEME classe', () => colleagueSameClass],
  ['un collegue d une AUTRE classe', () => colleagueOtherClass],
])('%s ne touche pas a l evaluation d un autre enseignant', (_label, who) => {
  it('ne la modifie pas (0 ligne, sans erreur)', async () => {
    const r = await asUserInTx(db, who(), (tx) => attempt(tx, updateTitle, [draftId, 'Pirate']));
    expect(r).toEqual({ rowCount: 0 });
  });

  it('ne la supprime pas', async () => {
    const r = await asUserInTx(db, who(), (tx) => attempt(tx, deleteOne, [draftId]));
    expect(r).toEqual({ rowCount: 0 });
  });

  it('n y saisit pas de note (refus 42501)', async () => {
    const r = await asUserInTx(db, who(), (tx) => attempt(tx, insertGrade, [f.a.schoolId, draftId, f.a.otherStudentId]));
    expect(r).toEqual({ denied: '42501' });
  });
});

describe.each([
  ['la direction (DIRECTOR)', () => directorUserId],
  ['le fondateur (SCHOOL_ADMIN)', () => f.a.adminUserId],
])('%s, porteuse des permissions generales', (_label, who) => {
  it('modifie l evaluation d un enseignant', async () => {
    const r = await asUserInTx(db, who(), (tx) => attempt(tx, updateTitle, [draftId, 'Corrige par la direction']));
    expect(r).toEqual({ rowCount: 1 });
  });

  it('y saisit des notes', async () => {
    const r = await asUserInTx(db, who(), (tx) => attempt(tx, insertGrade, [f.a.schoolId, draftId, f.a.otherStudentId]));
    expect(r).toEqual({ rowCount: 1 });
  });

  it('la supprime', async () => {
    const r = await asUserInTx(db, who(), (tx) => attempt(tx, deleteOne, [draftId]));
    expect(r).toEqual({ rowCount: 1 });
  });
});
