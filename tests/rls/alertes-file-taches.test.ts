import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, asUserInTx, type Db, type Fixture } from './helpers';

/**
 * Page Technique, lot B (0154) : les alertes et la file des tâches ne se
 * lisent que de la plateforme ; une école ne peut ni les lire, ni y écrire.
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

describe('Alertes et file des tâches (0154)', () => {
  it('une école ne lit pas les alertes ; la plateforme oui', async () => {
    await db.query('begin');
    try {
      await db.query(`insert into platform_alerts (key, message) values ('essai-rls', 'Alerte de test RLS')`);
      const seen = (uid: string) =>
        asUserInTx(db, uid, async (tx) => Number((await tx.query(`select count(*) n from platform_alerts where key = 'essai-rls'`)).rows[0].n));
      expect(await seen(f.a.adminUserId)).toBe(0);
      expect(await seen(f.platformAdminUserId)).toBe(1);
    } finally {
      await db.query('rollback');
    }
  });

  it('un seul problème ouvert par sorte', async () => {
    await db.query('begin');
    try {
      await db.query(`insert into platform_alerts (key, message) values ('essai-double', 'Premier')`);
      let code: string | null = null;
      try {
        await db.query('savepoint s');
        await db.query(`insert into platform_alerts (key, message) values ('essai-double', 'Second')`);
      } catch (e) {
        code = (e as { code?: string }).code ?? 'erreur';
        await db.query('rollback to savepoint s');
      }
      expect(code).toBe('23505');
    } finally {
      await db.query('rollback');
    }
  });

  it('personne n’écrit d’alerte depuis l’application ; une école ne lit pas la file', async () => {
    await db.query('begin');
    try {
      expect(await errorCode(f.platformAdminUserId, `insert into platform_alerts (key, message) values ('x', 'y')`)).toBe('42501');
      expect(await errorCode(f.a.adminUserId, 'select platform_job_queue()')).toBe('42501');
      expect(await errorCode(f.platformAdminUserId, 'select platform_job_queue()')).toBe(null);
    } finally {
      await db.query('rollback');
    }
  });
});
