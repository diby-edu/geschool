import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, asUserInTx, type Db, type Fixture } from './helpers';

/**
 * Sauvegardes des écoles (0156) : une école ne voit que ses propres sauvegardes,
 * et seulement avec le droit ; personne n'écrit directement (le serveur seul).
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

describe('Sauvegardes des écoles (0156)', () => {
  it('chacun ne voit que les sauvegardes de son école ; la plateforme voit tout', async () => {
    await db.query('begin');
    try {
      await db.query(`insert into school_backups (school_id, file_name) values ($1, 'essai-a.gsbak'), ($2, 'essai-b.gsbak')`, [f.a.schoolId, f.b.schoolId]);
      const seen = (uid: string) =>
        asUserInTx(db, uid, async (tx) => (await tx.query(`select file_name from school_backups where file_name like 'essai-%' order by 1`)).rows.map((r) => r.file_name));
      expect(await seen(f.a.adminUserId)).toEqual(['essai-a.gsbak']);
      expect(await seen(f.b.adminUserId)).toEqual(['essai-b.gsbak']);
      expect(await seen(f.platformAdminUserId)).toEqual(['essai-a.gsbak', 'essai-b.gsbak']);
    } finally {
      await db.query('rollback');
    }
  });

  it('personne n’écrit directement une sauvegarde depuis l’application', async () => {
    await db.query('begin');
    try {
      const code = await asUserInTx(db, f.a.adminUserId, async (tx) => {
        try {
          await tx.query(`insert into school_backups (school_id) values ($1)`, [f.a.schoolId]);
          return null;
        } catch (e) {
          return (e as { code?: string }).code ?? 'erreur';
        }
      });
      expect(code).toBe('42501');
    } finally {
      await db.query('rollback');
    }
  });

  it('les deux droits existent : Fondateur les deux, Informaticien seulement « sauvegarder »', async () => {
    const { rows } = await db.query(`
      select r.code, p.code perm from role_permissions rp join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id
       where r.school_id is null and p.code like 'backup.%' order by 1, 2`);
    expect(rows.map((r) => `${r.code}:${r.perm}`)).toEqual(['IT_ADMIN:backup.manage', 'SCHOOL_ADMIN:backup.manage', 'SCHOOL_ADMIN:backup.restore']);
  });
});
