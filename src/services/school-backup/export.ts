import 'server-only';

import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import type { Client } from 'pg';
import { ALL_BACKUP_TABLES, BACKUP_FORMAT, BACKUP_FORMAT_VERSION, SCHOOL_IDENTITY_COLUMNS } from '@/features/school-backup/catalog';
import { newSigner, openDb, schoolBackupDir, type BackupHeader } from './file';
import { q, readSchema, topoOrder } from './schema';
import { scopeWhere } from './scope';

/** Lignes lues par paquet : assez gros pour aller vite, assez petit pour la mémoire du VPS. */
const CHUNK = 5000;

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

/**
 * Écrit la sauvegarde d'une école dans un fichier .gsbak signé. Rien n'est
 * gardé en mémoire au-delà d'un paquet : une grande école (540 000 notes)
 * passe sans gonfler le worker.
 */
export async function exportSchool(input: {
  schoolId: string;
  scope: 'SCHOOL' | 'YEAR';
  yearId: string | null;
  suffix?: string;
}): Promise<{ fileName: string; filePath: string; sizeBytes: number; counts: Record<string, number> }> {
  const db = await openDb();
  const dir = schoolBackupDir(input.schoolId);
  await mkdir(dir, { recursive: true });
  try {
    const { rows: s } = await db.query<{ name: string; slug: string }>('select name, slug from schools where id = $1', [input.schoolId]);
    if (!s[0]) throw new Error('École introuvable.');
    let yearLabel: string | null = null;
    if (input.scope === 'YEAR') {
      if (!input.yearId) throw new Error('Choisissez l’année à sauvegarder.');
      const { rows: y } = await db.query<{ name: string }>('select name from academic_years where id = $1 and school_id = $2', [input.yearId, input.schoolId]);
      if (!y[0]) throw new Error('Année introuvable pour cette école.');
      yearLabel = y[0].name;
    }
    const { rows: mig } = await db
      .query<{ name: string }>(`select name from public._migrations order by name desc limit 1`)
      .catch(() => ({ rows: [] as { name: string }[] }));

    const now = new Date();
    const fileName = `${s[0].slug.replace(/[^a-z0-9-]/g, '')}-${stamp(now)}${input.suffix ? `-${input.suffix}` : ''}.gsbak`;
    const filePath = path.join(dir, fileName);
    const header: BackupHeader = {
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      schoolId: input.schoolId,
      schoolName: s[0].name,
      scope: input.scope,
      yearId: input.scope === 'YEAR' ? input.yearId : null,
      yearLabel,
      createdAt: now.toISOString(),
      migration: mig[0]?.name ?? null,
    };

    const schema = await readSchema(db);
    const order = topoOrder(ALL_BACKUP_TABLES, schema);
    const gzip = createGzip({ level: 6 });
    const out = createWriteStream(filePath);
    gzip.pipe(out);
    const signer = newSigner();
    const write = async (obj: unknown) => {
      const text = JSON.stringify(obj);
      signer.line(text);
      if (!gzip.write(`${text}\n`)) await once(gzip, 'drain');
    };

    const counts: Record<string, number> = {};
    try {
      await write(header);
      for (const table of order) counts[table] = await exportTable(db, table, schema, input, write);
      await write({ end: true, counts });
      gzip.write(`${JSON.stringify({ sig: signer.digest() })}\n`);
      gzip.end();
      await once(out, 'finish');
    } catch (e) {
      gzip.destroy();
      out.destroy();
      await unlink(filePath).catch(() => undefined);
      throw e;
    }
    return { fileName, filePath, sizeBytes: (await stat(filePath)).size, counts };
  } finally {
    await db.end();
  }
}

async function exportTable(
  db: Client,
  table: string,
  schema: Awaited<ReturnType<typeof readSchema>>,
  input: { schoolId: string; scope: 'SCHOOL' | 'YEAR'; yearId: string | null },
  write: (obj: unknown) => Promise<void>,
): Promise<number> {
  const info = schema.tables.get(table)!;
  const where = scopeWhere(table, 't', schema, input.scope === 'YEAR');
  const params: unknown[] = input.scope === 'YEAR' ? [input.schoolId, input.yearId] : [input.schoolId];
  // L'école elle-même : seulement son identité (jamais l'adresse de l'espace, le statut ni le code école).
  const select = table === 'schools' ? `jsonb_build_object('id', t.id, ${SCHOOL_IDENTITY_COLUMNS.map((c) => `'${c}', t.${q(c)}`).join(', ')})` : 'to_jsonb(t)';
  let n = 0;

  if (info.pk.length === 1) {
    // Pagination par clé : rapide même pour 540 000 notes.
    const key = q(info.pk[0]!);
    let last: unknown = null;
    for (;;) {
      const { rows } = await db.query<{ r: Record<string, unknown>; k: unknown }>(
        `select ${select} as r, t.${key} as k from ${q(table)} t where ${where}${last === null ? '' : ` and t.${key} > $${params.length + 1}`} order by t.${key} limit ${CHUNK}`,
        last === null ? params : [...params, last],
      );
      if (rows.length === 0) break;
      await write({ t: table, r: rows.map((x) => x.r) });
      n += rows.length;
      last = rows[rows.length - 1]!.k;
      if (rows.length < CHUNK) break;
    }
  } else {
    // Clé composée (tables petites) : par tranches ordonnées.
    const order = (info.pk.length ? info.pk : info.columns.map((c) => c.name)).map((c) => `t.${q(c)}`).join(', ');
    for (let offset = 0; ; offset += CHUNK) {
      const { rows } = await db.query<{ r: Record<string, unknown> }>(`select ${select} as r from ${q(table)} t where ${where} order by ${order} limit ${CHUNK} offset ${offset}`, params);
      if (rows.length === 0) break;
      await write({ t: table, r: rows.map((x) => x.r) });
      n += rows.length;
      if (rows.length < CHUNK) break;
    }
  }
  return n;
}
