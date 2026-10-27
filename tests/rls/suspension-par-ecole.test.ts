import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, asUserInTx, addMember, type Db, type Fixture } from './helpers';

/**
 * Suspendre une personne dans UNE école (0146, 2026-10-26) : son appartenance
 * passe à SUSPENDED dans cette école seulement. Elle n'y entre plus, garde ses
 * autres écoles, et la direction la voit toujours (pour la réactiver).
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

describe('Suspension dans une seule école (0146)', () => {
  it('suspendu dans A : plus membre de A, toujours membre de B, et visible par la direction de A', async () => {
    await db.query('begin');
    try {
      // L'enseignant de A enseigne aussi dans B.
      await addMember(db, f.b.schoolId, f.a.teacherUserId, 'TEACHER');
      await db.query(`update school_memberships set status = 'SUSPENDED' where school_id = $1 and user_id = $2`, [
        f.a.schoolId,
        f.a.teacherUserId,
      ]);

      const member = (school: string) =>
        asUserInTx(db, f.a.teacherUserId, async (tx) => (await tx.query('select app.is_member_of($1) as ok', [school])).rows[0].ok as boolean);
      expect(await member(f.a.schoolId)).toBe(false);
      expect(await member(f.b.schoolId)).toBe(true);

      const seenByAdminA = await asUserInTx(db, f.a.adminUserId, async (tx) =>
        Number((await tx.query('select count(*) as n from users where id = $1', [f.a.teacherUserId])).rows[0].n),
      );
      expect(seenByAdminA).toBe(1);
    } finally {
      await db.query('rollback');
    }
  });
});
