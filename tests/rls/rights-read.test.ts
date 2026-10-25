import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, countAs, asUser, createAuthUser, addMember, type Db, type Fixture } from './helpers';

/**
 * Ce qu'on lit en base suit les droits cochés (migration 0136).
 *
 * Constaté le 2026-10-25 : « voir les élèves » suffisait pour lire toutes les
 * notes publiées de l'école. Surveillant, Éducateur, Secrétaire, Informaticien,
 * sans aucun droit Notes, lisaient toutes les notes. Le chemin « note publiée »
 * reste réservé aux parents, aux élèves et aux enseignants de l'élève.
 */

let db: Db;
let f: Fixture;
let secretaryUserId: string;

beforeAll(async () => {
  db = await connect();
  f = await seedFixture(db);
  secretaryUserId = await createAuthUser(db, `rlstest-secretaire-${Date.now()}@test.local`);
  await addMember(db, f.a.schoolId, secretaryUserId, 'SECRETARY');
}, 120_000);

afterAll(async () => {
  if (db) {
    await cleanupFixture(db);
    await db.end();
  }
});

describe('Notes publiées (table grades)', () => {
  it('la secrétaire voit les élèves', async () => {
    expect(await countAs(db, secretaryUserId, 'select id from students where id = $1', [f.a.childStudentId])).toBe(1);
  });

  it('la secrétaire, sans droit Notes, ne lit aucune note publiée', async () => {
    expect(
      await countAs(db, secretaryUserId, 'select id from grades where assessment_id = $1', [f.a.publishedAssessmentId]),
    ).toBe(0);
  });

  it('le parent lit toujours la note publiée de son enfant', async () => {
    expect(
      await countAs(db, f.a.parentUserId, 'select id from grades where assessment_id = $1 and student_id = $2', [
        f.a.publishedAssessmentId,
        f.a.childStudentId,
      ]),
    ).toBe(1);
  });

  it("l'administrateur lit les notes de son école", async () => {
    expect(
      await countAs(db, f.a.adminUserId, 'select id from grades where assessment_id = $1', [f.a.publishedAssessmentId]),
    ).toBeGreaterThan(0);
  });
});

/** Lignes réellement modifiées par cet utilisateur (la transaction est annulée). */
async function updatedAs(userId: string, sql: string, params: unknown[]): Promise<number> {
  return asUser(db, userId, async (tx) => (await tx.query(sql, params)).rowCount ?? 0);
}

describe('Sa propre fiche (migration 0138)', () => {
  // Le 2026-10-25 : un enseignant pouvait écrire son propre taux horaire et son
  // contrat, donc gonfler sa paie ; un parent, son téléphone et son statut.
  it('un enseignant ne modifie pas son propre taux horaire', async () => {
    expect(await updatedAs(f.a.teacherUserId, 'update teachers set hourly_rate = 99999 where id = $1', [f.a.teacherId])).toBe(0);
  });

  it('un enseignant ne modifie pas son propre contrat', async () => {
    expect(await updatedAs(f.a.teacherUserId, "update teachers set employment_type = 'HOURLY' where id = $1", [f.a.teacherId])).toBe(0);
  });

  it('un parent ne modifie pas sa propre fiche', async () => {
    expect(await updatedAs(f.a.parentUserId, "update guardians set phone_e164 = '+2250700000000' where id = $1", [f.a.guardianId])).toBe(0);
  });

  it("l'administrateur modifie toujours les fiches de son école", async () => {
    expect(await updatedAs(f.a.adminUserId, 'update teachers set hourly_rate = 3000 where id = $1', [f.a.teacherId])).toBe(1);
    expect(await updatedAs(f.a.adminUserId, 'update guardians set address = address where id = $1', [f.a.guardianId])).toBe(1);
  });
});

describe('Son propre accès et son propre compte (migration 0139)', () => {
  // Le 2026-10-25 : tout utilisateur pouvait se réactiver, changer son
  // identifiant de connexion ou le statut de son compte, avec sa seule session.
  it('un parent ne réactive pas son propre accès', async () => {
    expect(await updatedAs(f.a.parentUserId, "update account_access set account_status = 'ACTIVE' where user_id = $1", [f.a.parentUserId])).toBe(0);
  });

  it('un enseignant ne change pas son identifiant de connexion', async () => {
    expect(
      await updatedAs(f.a.teacherUserId, "update account_access set login_identifier = 'autre@test.local' where user_id = $1", [f.a.teacherUserId]),
    ).toBe(0);
  });

  it('un utilisateur ne change pas le statut de son compte', async () => {
    const r = await asUser(db, f.a.parentUserId, async (tx) =>
      tx.query('update users set status = status where id = $1', [f.a.parentUserId]).then(
        () => 'permis',
        (e: { code?: string }) => e.code,
      ),
    );
    expect(r).toBe('42501');
  });

  it('un utilisateur change toujours sa photo', async () => {
    expect(await updatedAs(f.a.parentUserId, 'update users set avatar_url = avatar_url where id = $1', [f.a.parentUserId])).toBe(1);
  });
});
