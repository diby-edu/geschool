import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, seedFixture, cleanupFixture, asUserInTx, type Db, type Fixture } from './helpers';

/**
 * Modèles des fonctions (0150, lot 6) : seule la plateforme les règle ; un
 * droit technique hors catalogue n'est jamais retiré ; « aussi les écoles
 * existantes » AJOUTE sans rien retirer. Tout se passe dans une transaction
 * annulée : les vrais modèles ne sont pas touchés.
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

async function tryAs(uid: string, sql: string, params: unknown[]): Promise<string | null> {
  return asUserInTx(db, uid, async (tx) => {
    try {
      await tx.query(sql, params);
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? 'erreur';
    }
  });
}

describe('Modèles des fonctions (0150)', () => {
  it('une école ne peut ni régler un modèle, ni créer une fonction', async () => {
    await db.query('begin');
    try {
      expect(await tryAs(f.a.adminUserId, `select platform_save_template('IT_ADMIN', array[]::text[], array['audit.view'], false)`, [])).toBe('42501');
      expect(await tryAs(f.a.adminUserId, `select platform_create_function('F_TEST_RLS', 'Test RLS', '', null)`, [])).toBe('42501');
      expect(await tryAs(f.a.adminUserId, 'select platform_push_functions()', [])).toBe('42501');
    } finally {
      await db.query('rollback');
    }
  });

  it('la plateforme règle un modèle : seul le catalogue bouge, les écoles reçoivent sans rien perdre', async () => {
    await db.query('begin');
    try {
      const tpl = (await db.query(`select id from roles where school_id is null and code = 'IT_ADMIN'`)).rows[0].id as string;
      const before = (await db.query(`select p.code from role_permissions rp join permissions p on p.id = rp.permission_id where rp.role_id = $1`, [tpl])).rows.map(
        (r) => r.code as string,
      );
      const hidden = before.find((c) => c !== 'audit.view');
      expect(hidden).toBeTruthy();

      // Catalogue affiché réduit à « audit.view », coché : rien d'autre ne doit être retiré.
      await asUserInTx(db, f.platformAdminUserId, async (tx) => {
        await tx.query(`select platform_save_template('IT_ADMIN', array['audit.view'], array['audit.view'], true)`);
        const after = (await tx.query(`select p.code from role_permissions rp join permissions p on p.id = rp.permission_id where rp.role_id = $1`, [tpl])).rows.map(
          (r) => r.code as string,
        );
        expect(after).toContain('audit.view');
        expect(after).toContain(hidden);
        expect(after.length).toBe(new Set([...before, 'audit.view']).size);
      });
    } finally {
      await db.query('rollback');
    }
  });

  it('la plateforme crée une fonction « F_… » à partir d’une autre', async () => {
    await db.query('begin');
    try {
      await asUserInTx(db, f.platformAdminUserId, async (tx) => {
        await tx.query(`select platform_create_function('F_TEST_RLS', 'Test RLS', '', 'SECRETARY')`);
        const n = await tx.query(
          `select count(*)::int n from role_permissions rp join roles r on r.id = rp.role_id where r.school_id is null and r.code = 'F_TEST_RLS'`,
        );
        const m = await tx.query(
          `select count(*)::int n from role_permissions rp join roles r on r.id = rp.role_id where r.school_id is null and r.code = 'SECRETARY'`,
        );
        expect(n.rows[0].n).toBe(m.rows[0].n);
      });
    } finally {
      await db.query('rollback');
    }
  });
});
