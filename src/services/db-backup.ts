import 'server-only';

import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { backupsToKeep } from '@/lib/backup-retention';

/**
 * Sauvegarde de la base (page Technique, lot A, 0153).
 *
 * L'offre Supabase gratuite ne fait aucune sauvegarde téléchargeable : une
 * donnée effacée par erreur serait perdue. On copie donc toute la base chaque
 * nuit avec `pg_dump` (format « custom », compressé), sur le VPS, hors du
 * dossier du site. On garde les 7 dernières, plus une par semaine (4) et une
 * par mois (6) : environ 6 mois d'historique (lib/backup-retention.ts).
 *
 * La restauration ne se fait JAMAIS d'un clic : la base est partagée entre le
 * poste local et la production. Elle suit une procédure écrite (docs/DEPLOYMENT.md).
 */

const PREFIX = 'geschool-';

/** Sur le VPS : /var/www/geschool/backups. Ailleurs (poste de dev) : le dossier temporaire. */
export function backupDir(): string {
  if (process.env.BACKUP_DIR) return process.env.BACKUP_DIR;
  return process.platform === 'linux' ? '/var/www/geschool/backups' : path.join(os.tmpdir(), 'geschool-backups');
}

/** Un nom de fichier lisible, jamais choisi par l'utilisateur (le téléchargement s'appuie dessus). */
export const isBackupFileName = (name: string) => /^geschool-\d{8}-\d{4}\.dump$/.test(name);

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/** Retire le mot de passe d'un message d'erreur de pg_dump. */
const scrub = (text: string) => text.replace(/postgres(ql)?:\/\/[^\s@]+@/gi, 'postgresql://***@').slice(-1500);

function dump(url: string, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // nice : un seul cœur partagé avec dix autres projets, la copie passe après eux.
    const args = ['--format=custom', '--compress=6', '--no-owner', '--no-privileges', `--file=${file}`, url];
    const child =
      process.platform === 'linux'
        ? spawn('nice', ['-n', '10', 'pg_dump', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
        : spawn('pg_dump', args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    child.on('error', (e: NodeJS.ErrnoException) =>
      reject(new Error(e.code === 'ENOENT' ? 'pg_dump est introuvable sur ce serveur.' : e.message)),
    );
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(scrub(stderr) || `pg_dump a échoué (code ${code}).`))));
  });
}

/** Garde les 7 dernières, une par semaine et une par mois ; efface les autres. */
async function prune(dir: string): Promise<void> {
  const files = (await readdir(dir)).filter(isBackupFileName);
  const keep = backupsToKeep(files);
  for (const f of files) if (!keep.has(f)) await unlink(path.join(dir, f)).catch(() => undefined);
}

/** Une sauvegarde déjà en cours (moins de 2 h) : on n'en lance pas une seconde. */
export async function backupRunning(): Promise<boolean> {
  const admin = createAdminClient('platform.monitoring');
  const { data } = await admin
    .from('platform_backups' as never)
    .select('id')
    .eq('status', 'RUNNING')
    .gt('started_at', new Date(Date.now() - 2 * 3_600_000).toISOString())
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

export async function runBackup(trigger: 'NIGHT' | 'MANUAL'): Promise<{ ok: boolean; fileName: string; sizeBytes: number | null; error?: string }> {
  // La base est partagée avec le poste de développement : une copie lancée
  // d'ici serait notée « échouée » sur la page de la production.
  if (process.platform !== 'linux') return { ok: false, fileName: '', sizeBytes: null, error: 'La sauvegarde se fait sur le VPS, pas sur ce poste.' };
  const admin = createAdminClient('platform.monitoring');
  const dir = backupDir();
  const fileName = `${PREFIX}${stamp(new Date())}.dump`;
  const started = Date.now();

  const { data: row } = await admin
    .from('platform_backups' as never)
    .insert({ trigger, file_name: fileName } as never)
    .select('id')
    .single();
  const id = (row as { id: string } | null)?.id;

  const finish = async (patch: Record<string, unknown>) => {
    if (id) await admin.from('platform_backups' as never).update({ finished_at: new Date().toISOString(), duration_ms: Date.now() - started, ...patch } as never).eq('id', id);
  };

  try {
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, fileName);
    await dump(serverEnv().DATABASE_URL, file);
    const { size } = await stat(file);
    await finish({ status: 'OK', size_bytes: size });
    await prune(dir);
    return { ok: true, fileName, sizeBytes: size };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Erreur inconnue';
    await finish({ status: 'FAILED', error });
    await unlink(path.join(dir, fileName)).catch(() => undefined);
    return { ok: false, fileName, sizeBytes: null, error };
  }
}

/** Les fichiers réellement présents sur le disque (une ligne en base ne prouve pas qu'il existe encore). */
export async function backupFilesOnDisk(): Promise<{ name: string; size: number }[]> {
  const dir = backupDir();
  try {
    const names = (await readdir(dir)).filter(isBackupFileName).sort().reverse();
    return Promise.all(names.map(async (name) => ({ name, size: (await stat(path.join(dir, name))).size })));
  } catch {
    return [];
  }
}
