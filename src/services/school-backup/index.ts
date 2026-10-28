import 'server-only';

import path from 'node:path';
import { rename, stat, unlink } from 'node:fs/promises';
import { createAdminClient } from '@/lib/supabase/admin';
import { BACKUP_CATEGORIES } from '@/features/school-backup/catalog';
import { exportSchool } from './export';
import { readBackupFile, schoolBackupDir } from './file';
import { restoreSchool } from './restore';

/**
 * Sauvegardes des écoles (0156) : demander, faire, remettre, ranger.
 * Les demandes viennent du site ; le travail est fait par le worker
 * (services/job-queue.ts). Chaque étape est notée dans school_backups.
 */

const admin = () => createAdminClient('platform.monitoring');

/** Gardées : les 10 dernières faites à la main ou envoyées, les 3 dernières d'avant remise, toutes celles de fin d'année. */
const KEEP = { MANUAL: 10, UPLOAD: 10, BEFORE_RESTORE: 3 } as const;

type Row = {
  id: string;
  school_id: string;
  kind: 'BACKUP' | 'RESTORE';
  status: string;
  scope: 'SCHOOL' | 'YEAR';
  academic_year_id: string | null;
  trigger: string;
  created_by: string | null;
  file_name: string | null;
  restore_of: string | null;
  categories: string[];
};

async function row(id: string): Promise<Row> {
  const { data } = await admin().from('school_backups' as never).select('*').eq('id', id).maybeSingle();
  if (!data) throw new Error('Sauvegarde introuvable.');
  return data as unknown as Row;
}

async function patch(id: string, values: Record<string, unknown>): Promise<void> {
  await admin().from('school_backups' as never).update(values as never).eq('id', id);
}

/** Une sauvegarde ou une remise déjà en cours pour cette école (moins de 2 h) ? */
export async function busy(schoolId: string): Promise<boolean> {
  const { data } = await admin()
    .from('school_backups' as never)
    .select('id')
    .eq('school_id', schoolId)
    .eq('status', 'RUNNING')
    .gt('created_at', new Date(Date.now() - 2 * 3_600_000).toISOString())
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

export async function createBackupRow(input: {
  schoolId: string;
  scope: 'SCHOOL' | 'YEAR';
  yearId: string | null;
  trigger: 'MANUAL' | 'YEAR_CLOSE' | 'BEFORE_RESTORE' | 'UPLOAD';
  userId: string | null;
}): Promise<string> {
  const { data, error } = await admin()
    .from('school_backups' as never)
    .insert({
      school_id: input.schoolId,
      kind: 'BACKUP',
      scope: input.scope,
      academic_year_id: input.yearId,
      trigger: input.trigger,
      created_by: input.userId,
    } as never)
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function createRestoreRow(input: { schoolId: string; backupId: string; categories: string[]; userId: string }): Promise<string> {
  const { data, error } = await admin()
    .from('school_backups' as never)
    .insert({ school_id: input.schoolId, kind: 'RESTORE', restore_of: input.backupId, categories: input.categories, created_by: input.userId } as never)
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Le chemin du fichier d'une sauvegarde réussie de l'école (jamais un chemin venu de l'extérieur). */
export async function backupFilePath(schoolId: string, backupId: string): Promise<{ path: string; name: string } | null> {
  const r = await row(backupId).catch(() => null);
  if (!r || r.school_id !== schoolId || r.kind !== 'BACKUP' || r.status !== 'OK' || !r.file_name) return null;
  const p = path.join(schoolBackupDir(schoolId), r.file_name);
  return (await stat(p).catch(() => null)) ? { path: p, name: r.file_name } : null;
}

const SUFFIX: Record<string, string> = { YEAR_CLOSE: 'annee', BEFORE_RESTORE: 'avant-remise', UPLOAD: 'envoyee' };

/** Le travail d'une sauvegarde (worker). */
export async function runBackupJob(id: string): Promise<void> {
  const r = await row(id);
  if (r.status !== 'RUNNING') return;
  try {
    const out = await exportSchool({ schoolId: r.school_id, scope: r.scope, yearId: r.academic_year_id, ...(SUFFIX[r.trigger] ? { suffix: SUFFIX[r.trigger] } : {}) });
    await patch(id, { status: 'OK', finished_at: new Date().toISOString(), file_name: out.fileName, size_bytes: out.sizeBytes, counts: out.counts });
    await prune(r.school_id);
  } catch (e) {
    await patch(id, { status: 'FAILED', finished_at: new Date().toISOString(), error: e instanceof Error ? e.message.slice(0, 500) : 'Erreur inconnue' });
  }
}

/** Le travail d'une remise (worker) : copie de l'état actuel d'abord, puis la remise. */
export async function runRestoreJob(id: string): Promise<void> {
  const r = await row(id);
  if (r.status !== 'RUNNING' || !r.restore_of) return;
  try {
    const source = await backupFilePath(r.school_id, r.restore_of);
    if (!source) throw new Error('Le fichier de la sauvegarde n’est plus sur le serveur.');
    const check = await readBackupFile(source.path);
    if (!check.ok) throw new Error(check.error);

    // Avant de toucher à quoi que ce soit : une copie complète de l'état actuel.
    const before = await createBackupRow({ schoolId: r.school_id, scope: 'SCHOOL', yearId: null, trigger: 'BEFORE_RESTORE', userId: r.created_by });
    await runBackupJob(before);
    const b = await row(before);
    if (b.status !== 'OK') throw new Error('La copie de l’état actuel a échoué : rien n’a été remis.');

    const report = await restoreSchool({ schoolId: r.school_id, file: source.path, categories: r.categories });
    await patch(id, { status: 'OK', finished_at: new Date().toISOString(), counts: report });
  } catch (e) {
    await patch(id, { status: 'FAILED', finished_at: new Date().toISOString(), error: e instanceof Error ? e.message.slice(0, 500) : 'Erreur inconnue' });
  }
}

/**
 * Un fichier envoyé par l'école : vérifié (signature, école) puis rangé avec
 * ses sauvegardes, pour être remis comme les autres.
 */
export async function registerUpload(input: { schoolId: string; tmpPath: string; userId: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const check = await readBackupFile(input.tmpPath);
  if (!check.ok) return { ok: false, error: check.error };
  if (check.header.schoolId !== input.schoolId) return { ok: false, error: `Cette sauvegarde est celle d’une autre école (${check.header.schoolName}).` };
  const id = await createBackupRow({ schoolId: input.schoolId, scope: check.header.scope, yearId: check.header.yearId, trigger: 'UPLOAD', userId: input.userId });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const fileName = `envoi-${stamp}-${id.slice(0, 8)}.gsbak`.replace(/[^a-z0-9.-]/g, '');
  const dest = path.join(schoolBackupDir(input.schoolId), fileName);
  await rename(input.tmpPath, dest);
  await patch(id, { status: 'OK', finished_at: new Date().toISOString(), file_name: fileName, size_bytes: (await stat(dest)).size, counts: check.counts });
  await prune(input.schoolId);
  return { ok: true, id };
}

/** Ranger : efface les fichiers et lignes au-delà de ce qu'on garde (jamais les sauvegardes de fin d'année). */
async function prune(schoolId: string): Promise<void> {
  const { data } = await admin()
    .from('school_backups' as never)
    .select('id, trigger, file_name, status')
    .eq('school_id', schoolId)
    .eq('kind', 'BACKUP')
    .in('status', ['OK', 'FAILED'])
    .order('created_at', { ascending: false });
  const seen: Record<string, number> = {};
  for (const b of (data ?? []) as unknown as { id: string; trigger: keyof typeof KEEP | 'YEAR_CLOSE'; file_name: string | null }[]) {
    if (b.trigger === 'YEAR_CLOSE') continue;
    seen[b.trigger] = (seen[b.trigger] ?? 0) + 1;
    if (seen[b.trigger]! <= KEEP[b.trigger]) continue;
    if (b.file_name) await unlink(path.join(schoolBackupDir(schoolId), b.file_name)).catch(() => undefined);
    await admin().from('school_backups' as never).delete().eq('id', b.id);
  }
}

export const CATEGORY_KEYS = new Set(BACKUP_CATEGORIES.map((c) => c.key));

/** Une remise est-elle en cours pour l'école ? (bandeau pour tout le monde, quel que soit son droit) */
export async function restoreRunning(schoolId: string): Promise<boolean> {
  const { data } = await admin()
    .from('school_backups' as never)
    .select('id')
    .eq('school_id', schoolId)
    .eq('kind', 'RESTORE')
    .eq('status', 'RUNNING')
    .gt('created_at', new Date(Date.now() - 2 * 3_600_000).toISOString())
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}
