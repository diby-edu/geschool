import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, type Db } from './helpers';
import { ALL_BACKUP_TABLES, NEVER } from '@/features/school-backup/catalog';

/**
 * Sauvegardes des écoles (0156) : chaque table d'une école est rangée — dans une
 * catégorie de sauvegarde ou dans « jamais ». Une table ajoutée un jour sans être
 * rangée ferait perdre ses données à la remise : ce test le refuse.
 */

let db: Db;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

describe('Catalogue des sauvegardes', () => {
  it('toute table d’école est rangée (catégorie ou « jamais »)', async () => {
    const { rows } = await db.query<{ t: string }>(`
      select c.table_name as t
        from information_schema.columns c
        join information_schema.tables x on x.table_schema = 'public' and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
       where c.table_schema = 'public' and c.column_name = 'school_id'
      union
      -- tables rattachées à l'école par une autre (droits d'une fonction, rôles d'un membre…)
      select distinct tc.relname
        from pg_constraint con
        join pg_class tc on tc.oid = con.conrelid
        join pg_class pc on pc.oid = con.confrelid
        join pg_namespace n on n.oid = tc.relnamespace and n.nspname = 'public'
       where con.contype = 'f' and pc.relname <> 'schools'
         and exists (select 1 from information_schema.columns y where y.table_schema = 'public' and y.table_name = pc.relname and y.column_name = 'school_id')
         and not exists (select 1 from information_schema.columns y where y.table_schema = 'public' and y.table_name = tc.relname and y.column_name = 'school_id')
    `);
    const known = new Set([...ALL_BACKUP_TABLES, ...Object.keys(NEVER)]);
    const missing = rows.map((r) => r.t).filter((t) => !known.has(t));
    expect(missing).toEqual([]);
  });

  it('chaque table du catalogue existe, et aucune n’est à la fois sauvegardée et « jamais »', async () => {
    const { rows } = await db.query<{ t: string }>(`select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
    const existing = new Set(rows.map((r) => r.t));
    expect(ALL_BACKUP_TABLES.filter((t) => !existing.has(t))).toEqual([]);
    expect(ALL_BACKUP_TABLES.filter((t) => t in NEVER)).toEqual([]);
    expect(new Set(ALL_BACKUP_TABLES).size).toBe(ALL_BACKUP_TABLES.length);
  });
});
