import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, asUserInTx, type Db, type Fixture } from './helpers';

/**
 * Page Technique, lot C (0155) : courbes, activité de toutes les écoles et
 * connexions ratées sont réservées à la plateforme. Une école qui les lirait
 * verrait l'activité de ses concurrentes et les identifiants visés.
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

describe('Courbes, activité, sécurité (0155)', () => {
  it.each(['select platform_metric_series(24)', 'select platform_activity()', 'select platform_security()'])(
    '%s : refusé à une école, permis à la plateforme',
    async (sql) => {
      await db.query('begin');
      try {
        expect(await errorCode(f.a.adminUserId, sql)).toBe('42501');
        expect(await errorCode(f.platformAdminUserId, sql)).toBe(null);
      } finally {
        await db.query('rollback');
      }
    },
  );
});
