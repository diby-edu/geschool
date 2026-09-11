import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  connect, seedFixture, cleanupFixture, countAs, tryWriteAs,
  type Db, type Fixture,
} from './helpers';

/**
 * Scenarios d'isolation — docs/RBAC.md §7 et cahier des charges §69.
 *
 * Deux etablissements A et B, complets et independants. Chaque test verifie un
 * franchissement de frontiere precis.
 *
 * Note sur la semantique : en lecture, la RLS FILTRE (0 ligne) plutot qu'elle
 * ne leve une erreur. C'est voulu — repondre « interdit » confirmerait
 * l'existence de la donnee et permettrait de l'enumerer. En ecriture, elle
 * leve bien une erreur 42501.
 */

let db: Db;
let f: Fixture;

beforeAll(async () => {
  db = await connect();
  f = await seedFixture(db);
}, 120_000);

afterAll(async () => {
  if (db) {
    await cleanupFixture(db);
    await db.end();
  }
});

// ---------------------------------------------------------------------------

describe('Isolation entre etablissements', () => {
  it('un admin voit les eleves de son etablissement', async () => {
    const n = await countAs(db, f.a.adminUserId,
      'select id from students where school_id = $1', [f.a.schoolId]);
    expect(n).toBe(2);
  });

  it("un admin ne voit AUCUN eleve de l'autre etablissement", async () => {
    const n = await countAs(db, f.a.adminUserId,
      'select id from students where school_id = $1', [f.b.schoolId]);
    expect(n).toBe(0);
  });

  it('sans filtre explicite, il ne voit que son etablissement', async () => {
    // Le cas qui compte vraiment : un oubli de .eq('school_id') cote code ne
    // doit pas suffire a faire fuir des donnees.
    const n = await countAs(db, f.a.adminUserId, 'select id from students');
    expect(n).toBe(2);
  });

  it("injecter l'identifiant d'un eleve de B ne le rend pas visible (IDOR)", async () => {
    const n = await countAs(db, f.a.adminUserId,
      'select id from students where id = $1', [f.b.childStudentId]);
    expect(n).toBe(0);
  });

  it("ecrire dans l'autre etablissement est refuse", async () => {
    const r = await tryWriteAs(db, f.a.adminUserId,
      `insert into students (school_id, matricule, first_name, last_name)
       values ($1, 'ELV-INTRUS', 'Intrus', 'Test')`, [f.b.schoolId]);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe('42501');
  });

  it("modifier un eleve de l'autre etablissement n'affecte aucune ligne", async () => {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query(`set local request.jwt.claims = '{"sub":"${f.a.adminUserId}"}'`);
      const r = await db.query('update students set first_name = $1 where id = $2',
        ['Pirate', f.b.childStudentId]);
      expect(r.rowCount).toBe(0);
    } finally {
      await db.query('rollback');
    }
  });

  it("supprimer un eleve de l'autre etablissement n'affecte aucune ligne", async () => {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query(`set local request.jwt.claims = '{"sub":"${f.a.adminUserId}"}'`);
      const r = await db.query('delete from students where id = $1', [f.b.childStudentId]);
      expect(r.rowCount).toBe(0);
    } finally {
      await db.query('rollback');
    }
  });

  it("les autres etablissements sont invisibles dans la table schools", async () => {
    const n = await countAs(db, f.a.adminUserId, 'select id from schools');
    expect(n).toBe(1);
  });

  it('les notes ne traversent pas la frontiere', async () => {
    const n = await countAs(db, f.a.adminUserId,
      'select id from grades where school_id = $1', [f.b.schoolId]);
    expect(n).toBe(0);
  });

  it("l'enseignant de A ne voit aucun eleve de B", async () => {
    const n = await countAs(db, f.a.teacherUserId,
      'select id from students where school_id = $1', [f.b.schoolId]);
    expect(n).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('Perimetre parent', () => {
  it('un parent voit son enfant', async () => {
    const n = await countAs(db, f.a.parentUserId,
      'select id from students where id = $1', [f.a.childStudentId]);
    expect(n).toBe(1);
  });

  it("un parent ne voit PAS un autre eleve de la meme classe", async () => {
    // Le test le plus important du perimetre parent : meme classe, meme
    // etablissement, aucun lien de responsabilite.
    const n = await countAs(db, f.a.parentUserId,
      'select id from students where id = $1', [f.a.otherStudentId]);
    expect(n).toBe(0);
  });

  it('un parent ne voit que ses enfants, sans filtre explicite', async () => {
    const n = await countAs(db, f.a.parentUserId, 'select id from students');
    expect(n).toBe(1);
  });

  it("un parent de A ne voit rien de l'etablissement B", async () => {
    const n = await countAs(db, f.a.parentUserId,
      'select id from students where school_id = $1', [f.b.schoolId]);
    expect(n).toBe(0);
  });

  it('un parent voit les notes PUBLIEES de son enfant', async () => {
    const n = await countAs(db, f.a.parentUserId,
      'select g.id from grades g where g.assessment_id = $1 and g.student_id = $2',
      [f.a.publishedAssessmentId, f.a.childStudentId]);
    expect(n).toBe(1);
  });

  it('un parent ne voit PAS les notes non publiees', async () => {
    const n = await countAs(db, f.a.parentUserId,
      'select g.id from grades g where g.assessment_id = $1 and g.student_id = $2',
      [f.a.assessmentId, f.a.childStudentId]);
    expect(n).toBe(0);
  });

  it("un parent ne voit pas les notes d'un autre eleve, meme publiees", async () => {
    const n = await countAs(db, f.a.parentUserId,
      'select g.id from grades g where g.student_id = $1', [f.a.otherStudentId]);
    expect(n).toBe(0);
  });

  it('un parent ne peut pas modifier une note', async () => {
    const r = await tryWriteAs(db, f.a.parentUserId,
      'update grades set score = 20 where student_id = $1', [f.a.childStudentId]);
    // Refuse, ou sans effet : dans les deux cas la note est intacte
    if (r.allowed) {
      const n = await countAs(db, f.a.adminUserId,
        'select id from grades where student_id = $1 and score = 20', [f.a.childStudentId]);
      expect(n).toBe(0);
    } else {
      expect(r.code).toBe('42501');
    }
  });

  it('un parent ne peut pas inscrire un eleve', async () => {
    const r = await tryWriteAs(db, f.a.parentUserId,
      `insert into students (school_id, matricule, first_name, last_name)
       values ($1, 'ELV-PARENT', 'Faux', 'Eleve')`, [f.a.schoolId]);
    expect(r.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('Perimetre eleve', () => {
  it('un eleve voit ses propres donnees', async () => {
    const n = await countAs(db, f.a.childUserId,
      'select id from students where id = $1', [f.a.childStudentId]);
    expect(n).toBe(1);
  });

  it("un eleve ne voit pas un camarade de sa classe", async () => {
    const n = await countAs(db, f.a.childUserId,
      'select id from students where id = $1', [f.a.otherStudentId]);
    expect(n).toBe(0);
  });

  it('un eleve voit ses notes publiees, pas les autres', async () => {
    const published = await countAs(db, f.a.childUserId,
      'select id from grades where assessment_id = $1', [f.a.publishedAssessmentId]);
    const draft = await countAs(db, f.a.childUserId,
      'select id from grades where assessment_id = $1', [f.a.assessmentId]);
    expect(published).toBe(1);
    expect(draft).toBe(0);
  });

  it('un eleve ne peut pas modifier sa note', async () => {
    const r = await tryWriteAs(db, f.a.childUserId,
      'update grades set score = 20 where student_id = $1', [f.a.childStudentId]);
    if (r.allowed) {
      const n = await countAs(db, f.a.adminUserId,
        'select id from grades where student_id = $1 and score = 20', [f.a.childStudentId]);
      expect(n).toBe(0);
    } else {
      expect(r.code).toBe('42501');
    }
  });
});

// ---------------------------------------------------------------------------

describe('Perimetre enseignant', () => {
  it('un enseignant voit les eleves de sa classe', async () => {
    const n = await countAs(db, f.a.teacherUserId,
      'select id from students where school_id = $1', [f.a.schoolId]);
    expect(n).toBe(2);
  });

  it('un enseignant voit les notes de ses evaluations', async () => {
    const n = await countAs(db, f.a.teacherUserId,
      'select id from grades where assessment_id = $1', [f.a.assessmentId]);
    expect(n).toBe(2);
  });

  it("un enseignant ne voit pas les evaluations d'un autre etablissement", async () => {
    const n = await countAs(db, f.a.teacherUserId,
      'select id from assessments where school_id = $1', [f.b.schoolId]);
    expect(n).toBe(0);
  });

  it("un enseignant ne peut pas modifier l'evaluation d'un collegue d'un autre etablissement", async () => {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query(`set local request.jwt.claims = '{"sub":"${f.a.teacherUserId}"}'`);
      const r = await db.query('update assessments set title = $1 where id = $2',
        ['Detourne', f.b.assessmentId]);
      expect(r.rowCount).toBe(0);
    } finally {
      await db.query('rollback');
    }
  });

  it('un enseignant ne peut pas creer de classe', async () => {
    const r = await tryWriteAs(db, f.a.teacherUserId,
      `insert into classes (school_id, academic_year_id, level_id, code, name)
       values ($1, $2, $3, '4E9', '4e 9')`,
      [f.a.schoolId, f.a.yearId, f.a.levelId]);
    expect(r.allowed).toBe(false);
  });

  it("un enseignant ne peut pas reinitialiser un acces", async () => {
    const r = await tryWriteAs(db, f.a.teacherUserId,
      `insert into account_access (school_id, user_id, subject_kind, login_kind, login_identifier)
       values ($1, $2, 'STUDENT', 'MATRICULE', 'ELV-TEST-999')`,
      [f.a.schoolId, f.a.childUserId]);
    expect(r.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('Super Admin plateforme (ADR-007)', () => {
  it('voit les eleves des deux etablissements', async () => {
    const a = await countAs(db, f.platformAdminUserId,
      'select id from students where school_id = $1', [f.a.schoolId]);
    const b = await countAs(db, f.platformAdminUserId,
      'select id from students where school_id = $1', [f.b.schoolId]);
    expect(a).toBe(2);
    expect(b).toBe(2);
  });

  it('voit tous les etablissements', async () => {
    const n = await countAs(db, f.platformAdminUserId,
      'select id from schools where slug like $1', ['rlstest-%']);
    expect(n).toBe(2);
  });

  it('peut ecrire dans n importe quel etablissement', async () => {
    const r = await tryWriteAs(db, f.platformAdminUserId,
      `insert into students (school_id, matricule, first_name, last_name)
       values ($1, 'ELV-PLATFORM', 'Support', 'Plateforme')`, [f.b.schoolId]);
    expect(r.allowed).toBe(true);
  });

  it('voit les notes non publiees des deux etablissements', async () => {
    const n = await countAs(db, f.platformAdminUserId,
      'select id from grades where assessment_id in ($1, $2)',
      [f.a.assessmentId, f.b.assessmentId]);
    expect(n).toBe(4);
  });
});

// ---------------------------------------------------------------------------

describe('Etablissement suspendu', () => {
  it('la lecture reste possible, l ecriture est refusee', async () => {
    await db.query(`update schools set status = 'SUSPENDED' where id = $1`, [f.a.schoolId]);
    try {
      const readable = await countAs(db, f.a.adminUserId,
        'select id from students where school_id = $1', [f.a.schoolId]);
      expect(readable).toBe(2);

      const write = await tryWriteAs(db, f.a.adminUserId,
        `insert into students (school_id, matricule, first_name, last_name)
         values ($1, 'ELV-SUSPENDU', 'Test', 'Suspendu')`, [f.a.schoolId]);
      expect(write.allowed).toBe(false);
    } finally {
      await db.query(`update schools set status = 'ACTIVE' where id = $1`, [f.a.schoolId]);
    }
  });
});

// ---------------------------------------------------------------------------

describe('Journal d audit', () => {
  it('aucun client ne peut ecrire dans audit_logs', async () => {
    const r = await tryWriteAs(db, f.a.adminUserId,
      `insert into audit_logs (school_id, actor_user_id, action, module)
       values ($1, $2, 'faux', 'test')`, [f.a.schoolId, f.a.adminUserId]);
    expect(r.allowed).toBe(false);
  });

  it('aucun client ne peut effacer le journal', async () => {
    await db.query(
      `insert into audit_logs (school_id, actor_user_id, action, module)
       values ($1, $2, 'test.seed', 'test')`, [f.a.schoolId, f.a.adminUserId]);
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query(`set local request.jwt.claims = '{"sub":"${f.a.adminUserId}"}'`);
      const r = await db.query('delete from audit_logs where school_id = $1', [f.a.schoolId]);
      expect(r.rowCount).toBe(0);
    } finally {
      await db.query('rollback');
      await db.query(`delete from audit_logs where action = 'test.seed'`);
    }
  });
});
