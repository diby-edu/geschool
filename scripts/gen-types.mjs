#!/usr/bin/env node
/**
 * Genere src/types/database.ts depuis le catalogue Postgres.
 *
 *   pnpm db:types
 *
 * Pourquoi un generateur maison plutot que `supabase gen types` : le wrapper
 * npm de la CLI Supabase echoue a lancer son binaire sur ce poste Windows
 * (spawn UNKNOWN, errno -4094). Dependre d'un outil qui ne demarre pas sur la
 * machine de developpement n'etait pas tenable — et un generateur de 200
 * lignes lisant pg_catalog n'a aucune dependance, fonctionne partout, et
 * produit exactement la forme attendue par @supabase/supabase-js.
 *
 * Le fichier produit est VERSIONNE : la CI type le projet sans acces a la base.
 */

import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src', 'types', 'database.ts');

for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) process.loadEnvFile(path);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquant.');
  process.exit(1);
}

// --- Correspondance des types ------------------------------------------------

const SCALARS = {
  bool: 'boolean',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  float4: 'number',
  float8: 'number',
  numeric: 'number',
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  citext: 'string',
  uuid: 'string',
  date: 'string',
  time: 'string',
  timetz: 'string',
  timestamp: 'string',
  timestamptz: 'string',
  interval: 'string',
  inet: 'string',
  cidr: 'string',
  macaddr: 'string',
  json: 'Json',
  jsonb: 'Json',
  bytea: 'string',
  oid: 'number',
  name: 'string',
};

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  application_name: 'geschool-gen-types',
});

const quoteKey = (k) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k));

try {
  await client.connect();

  // --- Enumerations ---------------------------------------------------------

  const { rows: enumRows } = await client.query(`
    select t.typname as name, e.enumlabel as label
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    order by t.typname, e.enumsortorder
  `);

  const enums = new Map();
  for (const r of enumRows) {
    if (!enums.has(r.name)) enums.set(r.name, []);
    enums.get(r.name).push(r.label);
  }

  // --- Colonnes -------------------------------------------------------------

  const { rows: colRows } = await client.query(`
    select c.relname                as table_name,
           c.relkind               as kind,
           a.attname               as column_name,
           a.attnum                as position,
           not a.attnotnull        as is_nullable,
           t.typname               as type_name,
           t.typcategory           as type_category,
           coalesce(et.typname, '') as element_type,
           coalesce(et.typcategory, '') as element_category,
           (pg_get_expr(d.adbin, d.adrelid) is not null) as has_default,
           (a.attidentity <> '')   as is_identity,
           a.attgenerated <> ''    as is_generated
    from pg_attribute a
    join pg_class c        on c.oid = a.attrelid
    join pg_namespace n    on n.oid = c.relnamespace
    join pg_type t         on t.oid = a.atttypid
    left join pg_type et   on et.oid = t.typelem and t.typcategory = 'A'
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = 'public'
      and c.relkind in ('r', 'v')
      and a.attnum > 0
      and not a.attisdropped
      and c.relname <> '_migrations'
    order by c.relname, a.attnum
  `);

  function tsType(col) {
    // Tableau : on type l'element puis on suffixe
    if (col.type_category === 'A') {
      const el = col.element_type;
      const base = enums.has(el)
        ? enums.get(el).map((v) => JSON.stringify(v)).join(' | ')
        : (SCALARS[el] ?? 'unknown');
      return enums.has(el) ? `(${base})[]` : `${base}[]`;
    }
    if (enums.has(col.type_name)) {
      return `Database['public']['Enums'][${JSON.stringify(col.type_name)}]`;
    }
    return SCALARS[col.type_name] ?? 'unknown';
  }

  const tables = new Map();
  for (const col of colRows) {
    if (!tables.has(col.table_name)) {
      tables.set(col.table_name, { kind: col.kind, columns: [] });
    }
    tables.get(col.table_name).columns.push(col);
  }

  // --- Emission -------------------------------------------------------------

  const out = [];
  out.push(`/**
 * Types de la base de donnees.
 *
 * FICHIER GENERE — ne pas editer a la main.
 * Regeneration :  pnpm db:types
 *
 * Volontairement versionne : la CI doit pouvoir typer le projet sans acces a
 * la base.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
`);

  const emitTables = [];
  const emitViews = [];

  for (const [name, def] of [...tables.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const rowLines = [];
    const insertLines = [];
    const updateLines = [];

    for (const col of def.columns) {
      const type = tsType(col);
      const nullable = col.is_nullable;
      const rowType = nullable ? `${type} | null` : type;
      rowLines.push(`          ${quoteKey(col.column_name)}: ${rowType}`);

      // Optionnel en insertion si la base sait le remplir seule
      const optional = nullable || col.has_default || col.is_identity || col.is_generated;
      insertLines.push(
        `          ${quoteKey(col.column_name)}${optional ? '?' : ''}: ${rowType}`,
      );
      updateLines.push(`          ${quoteKey(col.column_name)}?: ${rowType}`);
    }

    const block =
      `      ${quoteKey(name)}: {\n` +
      `        Row: {\n${rowLines.join('\n')}\n        }\n` +
      (def.kind === 'v'
        ? ''
        : `        Insert: {\n${insertLines.join('\n')}\n        }\n` +
          `        Update: {\n${updateLines.join('\n')}\n        }\n`) +
      `        Relationships: []\n` +
      `      }`;

    (def.kind === 'v' ? emitViews : emitTables).push(block);
  }

  const enumBlocks = [...enums.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([name, values]) =>
        `      ${quoteKey(name)}: ${values.map((v) => JSON.stringify(v)).join(' | ')}`,
    );

  out.push(`export type Database = {
  public: {
    Tables: {
${emitTables.join('\n')}
    }
    Views: {
${emitViews.join('\n')}
    }
    Functions: Record<string, never>
    Enums: {
${enumBlocks.join('\n')}
    }
    CompositeTypes: Record<string, never>
  }
}

// --- Raccourcis pratiques ---------------------------------------------------

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
`);

  const next = out.join('\n');
  const previous = existsSync(target) ? readFileSync(target, 'utf8') : '';

  if (previous === next) {
    console.log('Types deja a jour.');
  } else {
    writeFileSync(target, next, 'utf8');
    console.log(
      `src/types/database.ts : ${emitTables.length} tables, ${emitViews.length} vues, ` +
        `${enums.size} enumerations, ${next.split('\n').length} lignes.`,
    );
    console.log('Penser a committer ce fichier.');
  }
} catch (error) {
  console.error('Generation impossible :', error.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
