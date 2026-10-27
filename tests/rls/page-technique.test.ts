import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, asUserInTx, type Db, type Fixture } from './helpers';

/**
 * Page Technique (0151, lot 7) : le journal des erreurs et l'état technique ne
 * se lisent que de la plateforme ; une école ne peut ni les lire, ni écrire
 * dans le journal.
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

async function errorCode(uid: string, sql: string): Promise<string | null> {
  return asUserInTx(db, uid, async (tx) => {
    try {
      await tx.query(sql);
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? 'erreur';
    }
  });
}

describe('Page Technique (0151)', () => {
  it('une école ne lit pas le journal des erreurs ; la plateforme oui', async () => {
    await db.query('begin');
    try {
      await db.query(`select log_app_error('Erreur de test RLS', '/test', null, null)`);
      const seen = (uid: string) =>
        asUserInTx(db, uid, async (tx) => Number((await tx.query(`select count(*) n from app_errors where message = 'Erreur de test RLS'`)).rows[0].n));
      expect(await seen(f.a.adminUserId)).toBe(0);
      expect(await seen(f.platformAdminUserId)).toBe(1);
    } finally {
      await db.query('rollback');
    }
  });

  it('une école ne peut ni écrire dans le journal, ni lire l’état technique', async () => {
    await db.query('begin');
    try {
      expect(await errorCode(f.a.adminUserId, `select log_app_error('x', null, null, null)`)).toBe('42501');
      expect(await errorCode(f.a.adminUserId, 'select platform_technical_status()')).toBe('42501');
      expect(await errorCode(f.platformAdminUserId, 'select platform_technical_status()')).toBe(null);
    } finally {
      await db.query('rollback');
    }
  });
});
