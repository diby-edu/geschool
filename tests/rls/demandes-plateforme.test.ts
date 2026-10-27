import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, asUserInTx, type Db, type Fixture } from './helpers';

/**
 * « Contacter la plateforme » et messages de la plateforme (0148, lot 5) :
 * une école ne lit que SES demandes, la plateforme les lit toutes, et les
 * messages envoyés par la plateforme ne se lisent que de la plateforme.
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

const count = (uid: string, sql: string, params: unknown[]) =>
  asUserInTx(db, uid, async (tx) => Number((await tx.query(`select count(*) as n from (${sql}) t`, params)).rows[0].n));

describe('Demandes à la plateforme (0148)', () => {
  it('l’école A lit sa demande et son fil ; l’école B et un enseignant non ; la plateforme oui', async () => {
    await db.query('begin');
    try {
      const { rows } = await db.query(
        `insert into platform_requests (school_id, author_id, subject) values ($1, $2, 'Test RLS') returning id`,
        [f.a.schoolId, f.a.adminUserId],
      );
      const id = rows[0].id as string;
      await db.query(`insert into platform_request_messages (request_id, author_id, body) values ($1, $2, 'Bonjour')`, [id, f.a.adminUserId]);
      const req = 'select id from platform_requests where id = $1';
      const msg = 'select id from platform_request_messages where request_id = $1';

      expect(await count(f.a.adminUserId, req, [id])).toBe(1);
      expect(await count(f.a.adminUserId, msg, [id])).toBe(1);
      expect(await count(f.b.adminUserId, req, [id])).toBe(0);
      expect(await count(f.b.adminUserId, msg, [id])).toBe(0);
      expect(await count(f.a.teacherUserId, req, [id])).toBe(0);
      expect(await count(f.platformAdminUserId, req, [id])).toBe(1);
    } finally {
      await db.query('rollback');
    }
  });

  it('les messages de la plateforme ne se lisent que de la plateforme', async () => {
    await db.query('begin');
    try {
      const { rows } = await db.query(
        `insert into platform_messages (title, body, target, audience) values ('Test', '', 'ALL', array['DIRECTION']) returning id`,
      );
      const sql = 'select id from platform_messages where id = $1';
      expect(await count(f.a.adminUserId, sql, [rows[0].id])).toBe(0);
      expect(await count(f.platformAdminUserId, sql, [rows[0].id])).toBe(1);
    } finally {
      await db.query('rollback');
    }
  });
});
