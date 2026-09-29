import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, countAs, type Db, type Fixture } from './helpers';

/**
 * Isolation en LECTURE, a l'interieur d'un meme etablissement (migration 0053).
 *
 * Audit du 2026-09-20 : l'isolation entre etablissements etait parfaite, mais tout
 * membre d'une ecole lisait tous les comptes (`users`) et toutes les fiches
 * d'enseignants (`teachers`) de cette ecole — telephone, e-mail, adresse, date de
 * naissance. Un parent ne doit pas lire un autre parent, ni la fiche d'un enseignant.
 *
 * Ces tests gardent la regle : un membre sans droit de gestion ne lit que SA ligne.
 * Le personnel habilite (ici l'administrateur) continue de tout lire.
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

describe('Comptes utilisateurs (table users)', () => {
  it('un parent ne lit que son propre compte', async () => {
    expect(await countAs(db, f.a.parentUserId, 'select id from users')).toBe(1);
  });

  it("un parent ne lit pas le compte d'un enseignant de son ecole", async () => {
    expect(await countAs(db, f.a.parentUserId, 'select id from users where id = $1', [f.a.teacherUserId])).toBe(0);
  });

  it("un parent ne lit pas le compte de l'administrateur de son ecole", async () => {
    expect(await countAs(db, f.a.parentUserId, 'select id from users where id = $1', [f.a.adminUserId])).toBe(0);
  });

  it('un enseignant ne lit que son propre compte', async () => {
    expect(await countAs(db, f.a.teacherUserId, 'select id from users')).toBe(1);
  });

  it("un enseignant ne lit pas le compte d'un parent", async () => {
    expect(await countAs(db, f.a.teacherUserId, 'select id from users where id = $1', [f.a.parentUserId])).toBe(0);
  });

  it("l'administrateur lit les comptes de son ecole", async () => {
    for (const id of [f.a.teacherUserId, f.a.parentUserId, f.a.adminUserId]) {
      expect(await countAs(db, f.a.adminUserId, 'select id from users where id = $1', [id])).toBe(1);
    }
  });

  it("l'administrateur d'une ecole ne lit aucun compte de l'autre", async () => {
    for (const id of [f.b.teacherUserId, f.b.parentUserId, f.b.adminUserId]) {
      expect(await countAs(db, f.a.adminUserId, 'select id from users where id = $1', [id])).toBe(0);
    }
  });
});

describe("Fiches d'enseignants (table teachers)", () => {
  it("un parent ne lit aucune fiche d'enseignant", async () => {
    expect(await countAs(db, f.a.parentUserId, 'select id from teachers')).toBe(0);
  });

  it("un parent ne lit pas la fiche de l'enseignant de son enfant", async () => {
    expect(await countAs(db, f.a.parentUserId, 'select id from teachers where id = $1', [f.a.teacherId])).toBe(0);
  });

  it('un enseignant lit sa propre fiche', async () => {
    expect(await countAs(db, f.a.teacherUserId, 'select id from teachers where id = $1', [f.a.teacherId])).toBe(1);
  });

  it("un enseignant ne lit que sa propre fiche, pas celles de l'ecole", async () => {
    expect(await countAs(db, f.a.teacherUserId, 'select id from teachers')).toBe(1);
  });

  it("l'administrateur lit les fiches d'enseignants de son ecole", async () => {
    expect(await countAs(db, f.a.adminUserId, 'select id from teachers where id = $1', [f.a.teacherId])).toBe(1);
  });

  it("l'administrateur d'une ecole ne lit aucune fiche de l'autre", async () => {
    expect(await countAs(db, f.a.adminUserId, 'select id from teachers where id = $1', [f.b.teacherId])).toBe(0);
  });
});

describe('Role anonyme (aucune connexion)', () => {
  // Le droit technique de lecture a ete retire (0053) : meme une policy oubliee ou
  // trop large ne suffirait plus a exposer une table a un visiteur non connecte.
  for (const table of ['students', 'users', 'teachers', 'account_access', 'grades', 'guardians', 'schools']) {
    it(`refuse l'acces a ${table}`, async () => {
      await db.query('begin');
      try {
        await db.query('set local role anon');
        await expect(db.query(`select id from ${table} limit 1`)).rejects.toMatchObject({ code: '42501' });
      } finally {
        await db.query('rollback');
      }
    });
  }
});
