import 'server-only';

import type { ClientBase } from 'pg';

/**
 * Ce que la base dit d'elle-même, pour les sauvegardes d'école : colonnes, clé
 * primaire, liens (clés étrangères) et l'ordre dans lequel remettre les tables
 * (une table après celles dont elle dépend). Lu à chaque sauvegarde ou remise :
 * une migration qui ajoute une colonne ou un lien est prise en compte seule.
 */

export type Fk = {
  name: string;
  cols: string[];
  parent: string;
  parentCols: string[];
  /** c : cascade, n : set null, r / a : refuser, d : défaut. */
  onDelete: string;
};

export type TableInfo = {
  name: string;
  columns: { name: string; nullable: boolean }[];
  pk: string[];
  fks: Fk[];
  hasSchoolId: boolean;
  hasYear: boolean;
};

export type SchemaInfo = { tables: Map<string, TableInfo>; referencedBy: Map<string, { table: string; fk: Fk }[]> };

export async function readSchema(db: ClientBase): Promise<SchemaInfo> {
  // L'une après l'autre : une seule connexion.
  const cols = await db.query<{ t: string; c: string; nullable: boolean }>(
      `select c.relname::text t, a.attname::text c, not a.attnotnull nullable
         from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        order by c.relname, a.attnum`,
    );
  const pks = await db.query<{ t: string; cols: string[] }>(
      `select c.relname::text t, array(select a.attname::text from unnest(con.conkey) with ordinality k(n, i)
                                  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) cols
         from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and con.contype = 'p'`,
    );
  const fks = await db.query<{ name: string; t: string; p: string; cols: string[]; pcols: string[]; del: string }>(
      `select con.conname::text name, tc.relname::text t, pc.relname::text p, con.confdeltype::text del,
              array(select a.attname::text from unnest(con.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) cols,
              array(select a.attname::text from unnest(con.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) pcols
         from pg_constraint con
         join pg_class tc on tc.oid = con.conrelid join pg_namespace tn on tn.oid = tc.relnamespace and tn.nspname = 'public'
         join pg_class pc on pc.oid = con.confrelid join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
        where con.contype = 'f'`,
    );

  const tables = new Map<string, TableInfo>();
  for (const r of cols.rows) {
    let t = tables.get(r.t);
    if (!t) {
      t = { name: r.t, columns: [], pk: [], fks: [], hasSchoolId: false, hasYear: false };
      tables.set(r.t, t);
    }
    t.columns.push({ name: r.c, nullable: r.nullable });
    if (r.c === 'school_id') t.hasSchoolId = true;
    if (r.c === 'academic_year_id') t.hasYear = true;
  }
  for (const r of pks.rows) {
    const t = tables.get(r.t);
    if (t) t.pk = r.cols;
  }
  const referencedBy = new Map<string, { table: string; fk: Fk }[]>();
  for (const r of fks.rows) {
    const fk: Fk = { name: r.name, cols: r.cols, parent: r.p, parentCols: r.pcols, onDelete: r.del };
    tables.get(r.t)?.fks.push(fk);
    const list = referencedBy.get(r.p) ?? [];
    list.push({ table: r.t, fk });
    referencedBy.set(r.p, list);
  }
  return { tables, referencedBy };
}

/** Les tables dans l'ordre où on peut les remplir : parents d'abord (les liens d'une table vers elle-même sont ignorés). */
export function topoOrder(names: string[], schema: SchemaInfo): string[] {
  const wanted = new Set(names);
  const done = new Set<string>();
  const out: string[] = [];
  const visit = (t: string, path: Set<string>) => {
    if (done.has(t) || path.has(t)) return;
    path.add(t);
    for (const fk of schema.tables.get(t)?.fks ?? []) if (fk.parent !== t && wanted.has(fk.parent)) visit(fk.parent, path);
    path.delete(t);
    done.add(t);
    out.push(t);
  };
  for (const t of [...names].sort()) visit(t, new Set());
  return out;
}

/** Nom SQL sûr (les noms viennent de la base elle-même, mais on ne prend aucun risque). */
export const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
