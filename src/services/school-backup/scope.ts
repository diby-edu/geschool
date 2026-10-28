import 'server-only';

import { BACKUP_CATEGORIES } from '@/features/school-backup/catalog';
import { q, type SchemaInfo } from './schema';

/**
 * Les lignes d'une école dans une table, en SQL : `school_id = $1`, ou, pour une
 * table rattachée par une autre (droits d'une fonction…), « dont le parent est
 * à l'école ». Pour une sauvegarde d'une année, les données du quotidien sont
 * limitées à cette année ($2) : directement (academic_year_id) ou par leur parent
 * (une note suit son évaluation).
 */

const DAILY = new Set(BACKUP_CATEGORIES.filter((c) => c.mode === 'replace').flatMap((c) => c.tables));

export function scopeWhere(table: string, alias: string, schema: SchemaInfo, withYear: boolean, depth = 0): string {
  if (depth > 6) throw new Error(`Rattachement trop profond pour ${table}.`);
  const t = schema.tables.get(table);
  if (!t) throw new Error(`Table inconnue : ${table}`);
  const a = q(alias);
  if (table === 'schools') return `${a}."id" = $1`;
  const parts: string[] = [];
  if (t.hasSchoolId) parts.push(`${a}."school_id" = $1`);
  else {
    const fk = t.fks.find((f) => f.cols.length === 1 && f.parent !== table && (schema.tables.get(f.parent)?.hasSchoolId ?? false));
    if (!fk) throw new Error(`Impossible de rattacher ${table} à une école.`);
    const p = `p${depth}`;
    parts.push(
      `${a}.${q(fk.cols[0]!)} in (select ${q(p)}.${q(fk.parentCols[0]!)} from ${q(fk.parent)} ${q(p)} where ${scopeWhere(fk.parent, p, schema, withYear, depth + 1)})`,
    );
  }
  if (withYear && DAILY.has(table)) {
    const y = yearWhere(table, alias, schema, depth);
    if (y) parts.push(y);
  }
  return parts.join(' and ');
}

/** Condition « appartient à l'année $2 », ou null si la table n'est pas liée à une année. */
function yearWhere(table: string, alias: string, schema: SchemaInfo, depth: number): string | null {
  if (depth > 6) return null;
  const t = schema.tables.get(table)!;
  const a = q(alias);
  if (t.hasYear) return `${a}."academic_year_id" = $2`;
  for (const fk of t.fks) {
    if (fk.cols.length !== 1 || fk.parent === table || !DAILY.has(fk.parent)) continue;
    const p = `y${depth}`;
    const inner = yearWhere(fk.parent, p, schema, depth + 1);
    if (inner) return `${a}.${q(fk.cols[0]!)} in (select ${q(p)}.${q(fk.parentCols[0]!)} from ${q(fk.parent)} ${q(p)} where ${inner})`;
  }
  return null;
}
