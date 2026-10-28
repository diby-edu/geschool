import 'server-only';

import type { Client } from 'pg';
import { BACKUP_CATEGORIES, NEVER, SCHOOL_IDENTITY_COLUMNS, categoryOfTable, type BackupCategory } from '@/features/school-backup/catalog';
import { openDb, readBackupFile, type BackupHeader, type BackupLine } from './file';
import { q, readSchema, topoOrder, type SchemaInfo, type TableInfo } from './schema';
import { scopeWhere } from './scope';

/**
 * Remettre une sauvegarde d'école (0156), tout ou par catégories.
 *
 * Tout se passe dans UNE transaction : ou tout est remis, ou rien ne bouge.
 * Les déclencheurs de la base sont suspendus pendant la remise (sinon ils
 * refuseraient une note d'une période close, ou recalculeraient les cours
 * datés) : c'est donc ce moteur qui garde la cohérence des liens —
 *   - une ligne dont le parent obligatoire n'existe plus n'est PAS remise
 *     (elle est comptée « non remise ») ;
 *   - un lien facultatif vers une personne disparue est vidé ;
 *   - ce que l'on retire entraîne ce qui en dépend, comme la base le ferait.
 *
 * Deux lectures du fichier : la première note les clés de la sauvegarde (pour
 * retirer ce qui n'y était pas), la seconde remet les lignes. Rien n'est chargé
 * en entier en mémoire ni recopié dans la base : une grande école passe sans
 * faire gonfler la base au-delà de sa taille.
 */

export type CategoryReport = { key: string; label: string; restored: number; removed: number; skipped: number; unchanged: number };
export type RestoreReport = { categories: CategoryReport[]; autoIncluded: string[]; seconds: number };

/**
 * Les catégories réellement remises : celles choisies, plus celles qui en
 * dépendent (remettre les emplois du temps retire des cours datés : leurs
 * appels doivent suivre, sinon ils pointeraient dans le vide).
 */
export function closeCategories(selected: string[], schema: SchemaInfo): { keys: string[]; autoIncluded: string[] } {
  const keys = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of BACKUP_CATEGORIES.filter((x) => keys.has(x.key) && x.mode === 'replace')) {
      for (const t of c.tables) {
        for (const ref of schema.referencedBy.get(t) ?? []) {
          const other = categoryOfTable(ref.table);
          if (other && other.mode === 'replace' && !keys.has(other.key) && ref.fk.onDelete !== 'n') {
            keys.add(other.key);
            changed = true;
          }
        }
      }
    }
  }
  return { keys: BACKUP_CATEGORIES.filter((c) => keys.has(c.key)).map((c) => c.key), autoIncluded: [...keys].filter((k) => !selected.includes(k)) };
}

const pkList = (t: TableInfo, alias: string) => t.pk.map((c) => `${q(alias)}.${q(c)}`).join(', ');
const keepTable = (table: string) => q(`keep_${table}`);

/** Retire des lignes (désignées par une sous-requête de clés) et, comme la base, ce qui en dépend. */
async function removeRows(db: Client, schema: SchemaInfo, table: string, keysSql: string, params: unknown[], removed: Map<string, number>, depth = 0): Promise<void> {
  if (depth > 8) throw new Error(`Liens trop profonds en retirant ${table}.`);
  const t = schema.tables.get(table)!;
  const tmp = q(`del_${depth}_${table}`.slice(0, 60));
  await db.query(`drop table if exists ${tmp}`);
  await db.query(`create temp table ${tmp} on commit drop as ${keysSql}`, params);
  const { rows } = await db.query<{ n: string }>(`select count(*) n from ${tmp}`);
  if (Number(rows[0]!.n) === 0) return;
  for (const ref of schema.referencedBy.get(table) ?? []) {
    if (ref.fk.cols.length !== 1 || ref.fk.parentCols.length !== 1) continue;
    const child = schema.tables.get(ref.table)!;
    const col = q(ref.fk.cols[0]!);
    const match = `x.${col} in (select ${q(ref.fk.parentCols[0]!)} from ${tmp})`;
    if (ref.table === table) continue; // lien d'une table vers elle-même : la ligne part de toute façon
    if (ref.fk.onDelete === 'n') {
      await db.query(`update ${q(ref.table)} x set ${col} = null where ${match}`);
    } else if (child.pk.length) {
      await removeRows(db, schema, ref.table, `select ${pkList(child, 'x')} from ${q(ref.table)} x where ${match}`, [], removed, depth + 1);
    }
  }
  const r = await db.query(`delete from ${q(table)} x where (${pkList(t, 'x')}) in (select ${t.pk.map(q).join(', ')} from ${tmp})`);
  removed.set(table, (removed.get(table) ?? 0) + (r.rowCount ?? 0));
}

/** Les conditions de remise d'une ligne : son école, et ses liens obligatoires vers des lignes qui existent. */
function insertParts(t: TableInfo, schema: SchemaInfo) {
  const required: string[] = [];
  const exprs = new Map<string, string>();
  for (const fk of t.fks) {
    if (fk.cols.length !== 1 || fk.parent === t.name) continue;
    const col = fk.cols[0]!;
    const nullable = t.columns.find((c) => c.name === col)?.nullable ?? false;
    const exists = `exists (select 1 from ${q(fk.parent)} p where p.${q(fk.parentCols[0]!)} = x.${q(col)})`;
    if (nullable && fk.onDelete === 'n') exprs.set(col, `case when x.${q(col)} is null or ${exists} then x.${q(col)} end`);
    else required.push(`(x.${q(col)} is null or ${exists})`);
  }
  // L'école : une ligne d'une autre école dans le fichier (impossible si la signature est bonne) n'entre jamais.
  if (t.hasSchoolId) required.push(`x."school_id" = $2`);
  else {
    const fk = t.fks.find((f) => f.cols.length === 1 && f.parent !== t.name && schema.tables.get(f.parent)?.hasSchoolId);
    if (fk) required.push(`exists (select 1 from ${q(fk.parent)} o where o.${q(fk.parentCols[0]!)} = x.${q(fk.cols[0]!)} and o."school_id" = $2)`);
  }
  const cols = t.columns.map((c) => c.name);
  return { cols, select: cols.map((c) => exprs.get(c) ?? `x.${q(c)}`), where: required.length ? required.join(' and ') : 'true' };
}

export async function restoreSchool(input: {
  schoolId: string;
  file: string;
  categories: string[];
  /** Essai : tout est fait puis annulé — rien ne change, mais le compte rendu est réel. */
  dryRun?: boolean;
}): Promise<RestoreReport> {
  const started = Date.now();
  const db = await openDb();
  try {
    const check = await readBackupFile(input.file);
    if (!check.ok) throw new Error(check.error);
    const header: BackupHeader = check.header;
    if (header.schoolId !== input.schoolId) throw new Error('Cette sauvegarde est celle d’une autre école.');

    const schema = await readSchema(db);
    const { keys, autoIncluded } = closeCategories(input.categories, schema);
    const cats = BACKUP_CATEGORIES.filter((c) => keys.includes(c.key));
    const modeOf = new Map<string, BackupCategory>();
    for (const c of cats) for (const t of c.tables) modeOf.set(t, c);
    const tables = topoOrder([...modeOf.keys()], schema);
    const withYear = header.scope === 'YEAR';
    const scopeParams = withYear ? [input.schoolId, header.yearId] : [input.schoolId];

    await db.query('begin');
    try {
      await db.query(`set local session_replication_role = replica`);
      await db.query(`set local statement_timeout = 0`);
      await db.query(`set local lock_timeout = '60s'`);

      // 1re lecture : les clés de la sauvegarde, pour les tables à remplacer.
      const keyed = tables.filter((t) => modeOf.get(t)!.mode === 'replace' || t === 'role_permissions');
      for (const t of keyed) {
        const info = schema.tables.get(t)!;
        await db.query(`create temp table ${keepTable(t)} on commit drop as select ${pkList(info, 'x')} from ${q(t)} x limit 0`);
      }
      const keyedSet = new Set(keyed);
      const indexKeys = async () => {
        for (const t of keyed) await db.query(`create index on ${keepTable(t)} (${schema.tables.get(t)!.pk.map(q).join(', ')})`);
      };
      await readBackupFile(input.file, async (line: BackupLine) => {
        if (!keyedSet.has(line.t)) return;
        const info = schema.tables.get(line.t)!;
        await db.query(
          `insert into ${keepTable(line.t)} select ${pkList(info, 'x')} from json_populate_recordset(null::${q(line.t)}, $1::json) x`,
          [JSON.stringify(line.r)],
        );
      });

      await indexKeys();
      await db.query(`analyze ${keyed.map(keepTable).join(', ') || 'pg_catalog.pg_class'}`).catch(() => undefined);

      // Retirer ce qui n'était pas dans la sauvegarde (enfants d'abord).
      const removed = new Map<string, number>();
      for (const t of [...tables].reverse()) {
        const c = modeOf.get(t)!;
        const info = schema.tables.get(t)!;
        if (c.mode === 'replace') {
          await removeRows(
            db,
            schema,
            t,
            `select ${pkList(info, 'x')} from ${q(t)} x where ${scopeWhere(t, 'x', schema, withYear)}
               and not exists (select 1 from ${keepTable(t)} k where ${info.pk.map((c) => `k.${q(c)} = x.${q(c)}`).join(' and ')})`,
            scopeParams,
            removed,
          );
        }
        if (t === 'role_permissions') {
          // Droits remis comme dans la sauvegarde, pour les fonctions qu'elle contient.
          const r = await db.query(
            `delete from role_permissions x using roles r where r.id = x.role_id and r.school_id = $1
               and x.role_id in (select role_id from ${keepTable('role_permissions')})
               and (x.role_id, x.permission_id) not in (select role_id, permission_id from ${keepTable('role_permissions')})`,
            [input.schoolId],
          );
          removed.set(t, (removed.get(t) ?? 0) + (r.rowCount ?? 0));
        }
      }

      // 2e lecture : remettre, parents d'abord (l'ordre du fichier).
      const restored = new Map<string, number>();
      const skipped = new Map<string, number>();
      const unchanged = new Map<string, number>();
      const parts = new Map(tables.filter((t) => t !== 'schools').map((t) => [t, insertParts(schema.tables.get(t)!, schema)]));
      let identity: Record<string, unknown> | null = null;
      await readBackupFile(input.file, async (line: BackupLine) => {
        const c = modeOf.get(line.t);
        if (!c) return;
        if (line.t === 'schools') {
          identity = line.r[0] ?? null;
          return;
        }
        const info = schema.tables.get(line.t)!;
        const p = parts.get(line.t)!;
        const json = JSON.stringify(line.r);
        const src = `from json_populate_recordset(null::${q(line.t)}, $1::json) x where ${p.where}`;
        const target = `insert into ${q(line.t)} (${p.cols.map(q).join(', ')}) select ${p.select.join(', ')} ${src}`;
        let sql: string;
        if (c.mode === 'replace' || c.mode === 'settings') {
          const set = p.cols.filter((col) => !info.pk.includes(col));
          sql = set.length
            ? `${target} on conflict (${info.pk.map(q).join(', ')}) do update set ${set.map((col) => `${q(col)} = excluded.${q(col)}`).join(', ')}
                 where (${set.map((col) => `${q(line.t)}.${q(col)}`).join(', ')}) is distinct from (${set.map((col) => `excluded.${q(col)}`).join(', ')})`
            : `${target} on conflict do nothing`;
        } else {
          sql = `${target} on conflict do nothing`;
        }
        const r = await db.query(sql, [json, input.schoolId]);
        const ok = await db.query<{ n: string }>(`select count(*) n ${src}`, [json, input.schoolId]);
        const eligible = Number(ok.rows[0]!.n);
        restored.set(line.t, (restored.get(line.t) ?? 0) + (r.rowCount ?? 0));
        skipped.set(line.t, (skipped.get(line.t) ?? 0) + (line.r.length - eligible));
        unchanged.set(line.t, (unchanged.get(line.t) ?? 0) + (eligible - (r.rowCount ?? 0)));
      });

      // L'identité de l'école (jamais l'adresse de l'espace, le statut ni le code école).
      const id = identity as Record<string, unknown> | null;
      if (id && modeOf.has('schools')) {
        const cols = SCHOOL_IDENTITY_COLUMNS.filter((col) => col in id);
        if (cols.length) {
          await db.query(
            `update schools s set ${cols.map((col) => `${q(col)} = (json_populate_record(null::schools, $1::json)).${q(col)}`).join(', ')} where s.id = $2`,
            [JSON.stringify(id), input.schoolId],
          );
          restored.set('schools', 1);
        }
      }

      await db.query(input.dryRun ? 'rollback' : 'commit');

      const sum = (m: Map<string, number>, c: BackupCategory) => c.tables.reduce((n, t) => n + (m.get(t) ?? 0), 0);
      return {
        categories: cats.map((c) => ({
          key: c.key,
          label: c.label,
          restored: sum(restored, c),
          removed: sum(removed, c),
          skipped: sum(skipped, c),
          unchanged: sum(unchanged, c),
        })),
        autoIncluded,
        seconds: Math.round((Date.now() - started) / 1000),
      };
    } catch (e) {
      await db.query('rollback').catch(() => undefined);
      throw e;
    }
  } finally {
    await db.end();
  }
}

/** Combien de lignes l'école a aujourd'hui, par catégorie (pour l'écran de confirmation). */
export async function countToday(schoolId: string, header: Pick<BackupHeader, 'scope' | 'yearId'>): Promise<Record<string, number>> {
  const db = await openDb();
  try {
    const schema = await readSchema(db);
    const withYear = header.scope === 'YEAR';
    const params = withYear ? [schoolId, header.yearId] : [schoolId];
    const out: Record<string, number> = {};
    for (const c of BACKUP_CATEGORIES) {
      let n = 0;
      for (const t of c.tables) {
        if (t in NEVER) continue;
        const { rows } = await db.query<{ n: string }>(`select count(*) n from ${q(t)} x where ${scopeWhere(t, 'x', schema, withYear)}`, params);
        n += Number(rows[0]!.n);
      }
      out[c.key] = n;
    }
    return out;
  } finally {
    await db.end();
  }
}

/** Pour chaque catégorie, celles qu'elle entraîne (écran de confirmation, sans rien toucher). */
export async function categoryPulls(): Promise<Map<string, string[]>> {
  const db = await openDb();
  try {
    const schema = await readSchema(db);
    return new Map(BACKUP_CATEGORIES.map((c) => [c.key, closeCategories([c.key], schema).autoIncluded]));
  } finally {
    await db.end();
  }
}
