import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, type Db } from './helpers';

/**
 * Couverture structurelle de la RLS.
 *
 * Ce fichier ne teste aucun scenario metier : il verifie que la protection
 * EXISTE sur toutes les tables concernees. C'est le garde-fou qui empeche
 * qu'une table arrive un jour sans policy — l'oubli fait echouer la CI, il ne
 * passe pas inapercu six mois.
 *
 * Rien n'est code en dur ici : la liste des tables est lue dans le catalogue
 * Postgres. Ajouter une table avec un school_id ajoute automatiquement son
 * controle.
 */

let db: Db;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

describe('Couverture RLS', () => {
  it('aucune table tenant sans RLS activee, forcee et ses quatre policies', async () => {
    const { rows } = await db.query('select * from app.tenant_tables_without_rls()');

    if (rows.length > 0) {
      const detail = rows
        .map(
          (r) =>
            `  ${r.table_name} — activee:${r.rls_enabled} forcee:${r.rls_forced} ` +
            `select:${r.has_select} insert:${r.has_insert} update:${r.has_update} delete:${r.has_delete}`,
        )
        .join('\n');
      throw new Error(`Tables tenant insuffisamment protegees :\n${detail}`);
    }

    expect(rows).toHaveLength(0);
  });

  it('toutes les tables de public ont la RLS activee ET forcee', async () => {
    const { rows } = await db.query(`
      select relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and (not c.relrowsecurity or not c.relforcerowsecurity)
      order by 1
    `);

    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('les fonctions de securite sont STABLE, SECURITY DEFINER et search_path fige', async () => {
    const { rows } = await db.query(`
      select p.proname,
             p.provolatile,
             p.prosecdef,
             coalesce(array_to_string(p.proconfig, ','), '') as config
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app'
        and p.proname in (
          'is_platform_admin', 'is_member_of', 'has_permission', 'has_any_permission',
          'can_read', 'can_write', 'school_is_writable', 'is_guardian_of',
          'is_self_student', 'can_see_student', 'teaches_class', 'teaches_group',
          'teaches_student', 'can_see_session', 'shares_school_with', 'can_manage_user'
        )
      order by p.proname
    `);

    expect(rows.length).toBeGreaterThan(10);

    for (const fn of rows) {
      // 's' = STABLE. Sans cela, la fonction serait evaluee une fois PAR LIGNE.
      expect(fn.provolatile, `${fn.proname} doit etre STABLE`).toBe('s');
      // Sans SECURITY DEFINER, les policies recursent a l'infini.
      expect(fn.prosecdef, `${fn.proname} doit etre SECURITY DEFINER`).toBe(true);
      // Sans search_path fige, une fonction DEFINER est detournable.
      expect(fn.config, `${fn.proname} doit figer son search_path`).toContain('search_path=');
    }
  });

  it('les fonctions de CALCUL ne sont pas SECURITY DEFINER', async () => {
    // Elles renvoient des donnees : en DEFINER, elles contourneraient la RLS
    // et un parent obtiendrait la moyenne de n'importe quel eleve.
    const { rows } = await db.query(`
      select p.proname, p.prosecdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app'
        and p.proname in (
          'student_subject_average', 'student_period_average', 'class_period_ranking'
        )
    `);

    expect(rows.length).toBe(3);
    for (const fn of rows) {
      expect(fn.prosecdef, `${fn.proname} ne doit PAS etre SECURITY DEFINER`).toBe(false);
    }
  });

  it('toutes les vues de public sont en security_invoker', async () => {
    // Une vue s'execute par defaut avec les droits de son proprietaire et
    // contourne donc la RLS de l'appelant.
    const { rows } = await db.query(`
      select c.relname,
             coalesce(array_to_string(c.reloptions, ','), '') as options
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
    `);

    for (const view of rows) {
      expect(view.options, `la vue ${view.relname} doit porter security_invoker=true`).toContain(
        'security_invoker=true',
      );
    }
  });

  it('le catalogue de permissions et les roles systeme sont en place', async () => {
    const perms = await db.query('select count(*)::int as n from permissions');
    const roles = await db.query('select count(*)::int as n from roles where is_system');

    expect(perms.rows[0].n).toBeGreaterThanOrEqual(120);
    expect(roles.rows[0].n).toBe(9);
  });

  it('PARENT et STUDENT ne portent aucune permission', async () => {
    // Leur acces vient entierement du perimetre derive. Leur accorder
    // students.view ouvrirait TOUT l'etablissement (branche non scopee de
    // app.can_see_student). Voir la migration 0028.
    const { rows } = await db.query(`
      select r.code, count(rp.permission_id)::int as n
      from roles r
      left join role_permissions rp on rp.role_id = r.id
      where r.is_system and r.code in ('PARENT', 'STUDENT')
      group by r.code
      order by r.code
    `);

    expect(rows).toEqual([
      { code: 'PARENT', n: 0 },
      { code: 'STUDENT', n: 0 },
    ]);
  });

  it('les trois buckets existent et sont prives', async () => {
    const { rows } = await db.query(`
      select id, public
      from storage.buckets
      where id in ('documents', 'avatars', 'reports')
      order by id
    `);

    expect(rows).toEqual([
      { id: 'avatars', public: false },
      { id: 'documents', public: false },
      { id: 'reports', public: false },
    ]);
  });

  it('storage.objects porte les quatre policies de l application', async () => {
    const { rows } = await db.query(`
      select p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage'
        and c.relname = 'objects'
        and p.polname like 'geschool\\_%'
      order by 1
    `);

    expect(rows.map((r) => r.polname)).toEqual([
      'geschool_objects_delete',
      'geschool_objects_insert',
      'geschool_objects_select',
      'geschool_objects_update',
    ]);
  });
});
