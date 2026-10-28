import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, asUserInTx, type Db, type Fixture } from './helpers';

/**
 * Page Technique, lot A (0153) : les relevés du serveur et le compte rendu des
 * sauvegardes ne se lisent que de la plateforme ; une école ne peut ni les
 * lire, ni y écrire, ni interroger la sonde de la base.
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

describe('Surveillance et sauvegardes (0153)', () => {
  it('une école ne lit ni les relevés ni les sauvegardes ; la plateforme oui', async () => {
    await db.query('begin');
    try {
      await db.query(`insert into platform_metrics (data) values ('{"essai": "rls"}')`);
      await db.query(`insert into platform_backups (trigger, file_name, status) values ('MANUAL', 'geschool-essai-rls.dump', 'OK')`);
      const seen = (uid: string) =>
        asUserInTx(db, uid, async (tx) => ({
          metrics: Number((await tx.query(`select count(*) n from platform_metrics where data->>'essai' = 'rls'`)).rows[0].n),
          backups: Number((await tx.query(`select count(*) n from platform_backups where file_name = 'geschool-essai-rls.dump'`)).rows[0].n),
        }));
      expect(await seen(f.a.adminUserId)).toEqual({ metrics: 0, backups: 0 });
      expect(await seen(f.platformAdminUserId)).toEqual({ metrics: 1, backups: 1 });
    } finally {
      await db.query('rollback');
    }
  });

  it('personne n’écrit depuis l’application, et une école n’interroge pas la sonde', async () => {
    await db.query('begin');
    try {
      expect(await errorCode(f.a.adminUserId, `insert into platform_metrics (data) values ('{}')`)).toBe('42501');
      expect(await errorCode(f.platformAdminUserId, `insert into platform_backups (trigger) values ('MANUAL')`)).toBe('42501');
      expect(await errorCode(f.a.adminUserId, 'select platform_db_probe()')).toBe('42501');
    } finally {
      await db.query('rollback');
    }
  });
});
