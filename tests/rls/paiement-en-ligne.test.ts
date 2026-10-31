import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, asUserInTx, type Db, type Fixture } from './helpers';

/**
 * Paiement en ligne (0157) : personne ne confirme un paiement ni ne touche à la
 * réserve de SMS depuis l'application ; seul le serveur (service_role) le peut,
 * après avoir relu le statut chez PayDunya.
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

async function errorCode(uid: string, sql: string, params: unknown[] = []): Promise<string | null> {
  return asUserInTx(db, uid, async (tx) => {
    try {
      await tx.query(sql, params);
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? 'erreur';
    }
  });
}

describe('Paiement en ligne (0157)', () => {
  it('ni une école ni la plateforme ne confirment un paiement à la main', async () => {
    await db.query('begin');
    try {
      for (const uid of [f.a.adminUserId, f.platformAdminUserId]) {
        expect(await errorCode(uid, `select billing_settle_online(gen_random_uuid(), 100, '{}'::jsonb)`)).toBe('42501');
        expect(await errorCode(uid, `select billing_cancel_online(gen_random_uuid(), 'cancelled', '')`)).toBe('42501');
        expect(await errorCode(uid, `select sms_credit_consume($1, 1)`, [f.a.schoolId])).toBe('42501');
      }
    } finally {
      await db.query('rollback');
    }
  });

  it('la réserve de SMS : lisible par l’école, jamais écrite par elle ; invisible des autres', async () => {
    await db.query('begin');
    try {
      await db.query(`insert into sms_credit_balances (school_id, balance) values ($1, 500)`, [f.a.schoolId]);
      const seen = (uid: string) => asUserInTx(db, uid, async (tx) => (await tx.query(`select balance from sms_credit_balances`)).rows.map((r) => r.balance));
      expect(await seen(f.a.adminUserId)).toEqual([500]);
      expect(await seen(f.b.adminUserId)).toEqual([]);
      expect(await errorCode(f.a.adminUserId, `update sms_credit_balances set balance = 99999 where school_id = $1`, [f.a.schoolId])).toBe(null);
      expect((await db.query(`select balance from sms_credit_balances where school_id = $1`, [f.a.schoolId])).rows[0].balance).toBe(500);
    } finally {
      await db.query('rollback');
    }
  });

  it('un achat de SMS ne rouvre pas un abonnement', async () => {
    await db.query('begin');
    try {
      await db.query(`update subscriptions set status = 'PAST_DUE' where school_id = $1`, [f.a.schoolId]);
      await db.query(`insert into payments (school_id, amount, status, purpose, sms_quantity, paid_at) values ($1, 7500, 'PAID', 'SMS_PACK', 500, now())`, [f.a.schoolId]);
      const { rows } = await db.query(`select status from subscriptions where school_id = $1`, [f.a.schoolId]);
      expect(rows.every((r) => r.status === 'PAST_DUE')).toBe(true);
    } finally {
      await db.query('rollback');
    }
  });
});
