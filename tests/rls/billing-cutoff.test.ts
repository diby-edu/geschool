import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, asUser, type Db, type Fixture } from './helpers';

/**
 * Abonnement expiré, délai de grâce passé : l'école ne peut plus rien écrire
 * (0143). L'administration de la plateforme garde la main, et un paiement
 * confirmé rend l'accès tout de suite.
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

/** Lignes réellement modifiées (la transaction est annulée). */
async function updatedAs(userId: string, sql: string, params: unknown[]): Promise<number> {
  return asUser(db, userId, async (tx) => (await tx.query(sql, params)).rowCount ?? 0);
}

const renameStudent = 'update students set first_name = first_name where id = $1';

describe('Coupure après le délai de grâce (0143)', () => {
  it('sans abonnement, l’école écrit normalement', async () => {
    expect(await updatedAs(f.a.adminUserId, renameStudent, [f.a.childStudentId])).toBe(1);
  });

  it('essai fini depuis 60 jours : plus aucune écriture, sauf pour la plateforme ; le paiement rend tout', async () => {
    await db.query('begin');
    try {
      await db.query(
        `insert into subscriptions (school_id, status, trial_ends_at) values ($1, 'TRIALING', now() - interval '60 days')`,
        [f.a.schoolId],
      );
      const blocked = async (uid: string) => {
        await db.query('savepoint u');
        await db.query('set local role authenticated');
        await db.query(`set local request.jwt.claims = '${JSON.stringify({ sub: uid })}'`);
        const n = (await db.query(renameStudent, [f.a.childStudentId])).rowCount ?? 0;
        await db.query('rollback to savepoint u');
        return n;
      };
      expect(await blocked(f.a.adminUserId)).toBe(0);
      expect(await blocked(f.platformAdminUserId)).toBe(1);

      // L'autre école n'est pas touchée.
      await db.query('savepoint b');
      await db.query('set local role authenticated');
      await db.query(`set local request.jwt.claims = '${JSON.stringify({ sub: f.b.adminUserId })}'`);
      const other = await db.query('select id from students where school_id = $1 limit 1', [f.b.schoolId]);
      const nB = other.rows[0] ? (await db.query(renameStudent, [other.rows[0].id])).rowCount : 1;
      await db.query('rollback to savepoint b');
      expect(nB).toBe(1);

      // Paiement confirmé : l'abonnement redevient « abonnée », l'école écrit de nouveau.
      await db.query(`insert into payments (school_id, amount, currency, method, status, paid_at) values ($1, 100000, 'XOF', 'CASH', 'PAID', now())`, [
        f.a.schoolId,
      ]);
      const sub = await db.query(`select status from subscriptions where school_id = $1`, [f.a.schoolId]);
      expect(sub.rows[0].status).toBe('ACTIVE');
      expect(await blocked(f.a.adminUserId)).toBe(1);
    } finally {
      await db.query('rollback');
    }
  });
});
