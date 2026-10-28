import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { publicEnv, serverEnv } from '@/lib/env';
import { smsBalance } from '@/features/sms/balance';
import { requireAdmin } from './admin';
import { readPlatformSettings } from './settings';
import type { MetricSnapshot } from '@/services/platform-metrics';

/**
 * La page Technique (lot 7, 0151, maquette docs/maquettes/super-admin-technique.html) :
 * est-ce que tout tourne ? Un voyant par partie, et ce qu'il faut faire quand
 * ce n'est pas vert.
 */

export type Light = 'green' | 'orange' | 'red';

/** Les tâches de nuit du worker (src/workers/index.ts) : même nom de file, même horaire. */
export const TASKS = [
  { name: 'billing-expire-due', label: 'Abonnements expirés', when: 'chaque nuit à 0 h 05' },
  { name: 'db-backup', label: 'Sauvegarde de la base', when: 'chaque nuit à 2 h' },
  { name: 'attendance-alerts', label: 'Alertes d’absence', when: 'chaque matin à 6 h' },
  { name: 'sms-delivery-reports', label: 'Accusés de réception SMS', when: 'chaque matin à 6 h 15' },
  { name: 'platform-metrics', label: 'Relevé de surveillance', when: 'toutes les 5 minutes' },
] as const;
export type TaskName = (typeof TASKS)[number]['name'];

type Raw = {
  pgboss: boolean;
  jobs: { name: string; lastCompleted: string | null; lastFailed: string | null; failed7d: number; waiting: number }[];
  schedules: { name: string; cron: string }[];
  dbBytes: number;
  tables: { name: string; bytes: number }[];
  connections: number;
  migrations: number;
  lastMigration: string | null;
  sms: { sent7d: number; failed7d: number; pending: number; lastFailure: { at: string; error: string | null } | null };
  loginFailures24h: number;
  lockedNow: number;
  platformAdmins: number;
  errors7d: number;
};

export type TaskState = {
  name: TaskName;
  label: string;
  when: string;
  scheduled: boolean;
  lastRun: string | null;
  lastFailed: string | null;
  failed7d: number;
  lastManual: string | null;
  light: Light;
};

export type AppError = { id: string; message: string; path: string | null; occurrences: number; firstSeen: string; lastSeen: string; detail: string | null };

export type TechnicalStatus = {
  tasks: TaskState[];
  workerSeen: boolean;
  sms: Raw['sms'] & { provider: string; configured: boolean; balance: number | null; light: Light };
  db: { bytes: number; limitBytes: number; tables: Raw['tables']; connections: number; migrations: number; lastMigration: string | null; light: Light };
  security: { loginFailures24h: number; lockedNow: number; platformAdmins: number; light: Light };
  config: { label: string; ok: boolean; hint: string }[];
  errors: AppError[];
  errors7d: number;
  errorsLight: Light;
};

const DAY = 86_400_000;
const worst = (...l: Light[]): Light => (l.includes('red') ? 'red' : l.includes('orange') ? 'orange' : 'green');

export async function getTechnicalStatus(): Promise<TechnicalStatus | null> {
  await requireAdmin();
  const supabase = await createClient();
  const env = serverEnv();
  const [{ data, error }, settings, balance, { data: errs }, { data: runs }] = await Promise.all([
    supabase.rpc('platform_technical_status' as never),
    readPlatformSettings(),
    smsBalance(),
    supabase.from('app_errors' as never).select('id, message, path, occurrences, first_seen, last_seen, detail').order('last_seen', { ascending: false }).limit(20),
    supabase.from('audit_logs').select('created_at, after').eq('action', 'platform.task_run').order('created_at', { ascending: false }).limit(50),
  ]);
  if (error || !data) return null;
  const r = data as unknown as Raw;
  const now = Date.now();

  const manual = new Map<string, string>();
  for (const x of (runs ?? []) as { created_at: string; after: { task?: string } | null }[]) {
    const t = x.after?.task;
    if (t && !manual.has(t)) manual.set(t, x.created_at);
  }

  const tasks: TaskState[] = TASKS.map((t) => {
    const job = r.jobs.find((j) => j.name === t.name);
    const scheduled = r.schedules.some((s) => s.name === t.name);
    const lastRun = job?.lastCompleted ?? null;
    const recent = lastRun !== null && now - new Date(lastRun).getTime() < 2 * DAY;
    const failedAfter = job?.lastFailed && (!lastRun || job.lastFailed > lastRun);
    return {
      name: t.name,
      label: t.label,
      when: t.when,
      scheduled,
      lastRun,
      lastFailed: job?.lastFailed ?? null,
      failed7d: Number(job?.failed7d ?? 0),
      lastManual: manual.get(t.name) ?? null,
      light: failedAfter ? 'red' : recent ? 'green' : 'orange',
    };
  });

  const limitBytes = settings.dbLimitMb * 1024 * 1024;
  const used = r.dbBytes / limitBytes;
  const provider = env.SMS_PROVIDER;
  const configured = provider !== 'console' && Boolean(env.LETEXTO_API_KEY || env.SMS_API_KEY);
  const smsFailRate = r.sms.sent7d + r.sms.failed7d > 0 ? r.sms.failed7d / (r.sms.sent7d + r.sms.failed7d) : 0;

  const errors = ((errs ?? []) as unknown as { id: string; message: string; path: string | null; occurrences: number; first_seen: string; last_seen: string; detail: string | null }[]).map(
    (e) => ({ id: e.id, message: e.message, path: e.path, occurrences: e.occurrences, firstSeen: e.first_seen, lastSeen: e.last_seen, detail: e.detail }),
  );

  const workerSeen = r.pgboss && (r.schedules.length > 0 || r.jobs.length > 0);
  return {
    tasks,
    workerSeen,
    sms: {
      ...r.sms,
      provider,
      configured,
      balance,
      light: !configured ? 'orange' : smsFailRate > 0.2 ? 'red' : smsFailRate > 0.05 || (balance !== null && balance < 100) ? 'orange' : 'green',
    },
    db: {
      bytes: r.dbBytes,
      limitBytes,
      tables: r.tables,
      connections: r.connections,
      migrations: r.migrations,
      lastMigration: r.lastMigration,
      light: used >= 0.9 ? 'red' : used >= 0.7 ? 'orange' : 'green',
    },
    security: {
      loginFailures24h: r.loginFailures24h,
      lockedNow: r.lockedNow,
      platformAdmins: r.platformAdmins,
      light: r.lockedNow > 5 || r.loginFailures24h > 200 ? 'orange' : 'green',
    },
    config: [
      { label: 'SMS', ok: configured, hint: configured ? `opérateur ${provider}` : 'mode « console » : rien ne part vraiment (clé de l’opérateur absente)' },
      // Le worker est un programme à part (PM2 « geschool-worker ») : le site
      // web a volontairement WORKER_ENABLED=false. On regarde donc ce que le
      // worker a laissé en base (ses horaires), pas le réglage du site.
      {
        label: 'Tâches de nuit',
        ok: workerSeen,
        hint: workerSeen ? 'le worker tourne : tâches programmées' : 'le worker n’a jamais tourné sur cette base',
      },
      { label: 'Suivi des erreurs (Sentry)', ok: Boolean(publicEnv.NEXT_PUBLIC_SENTRY_DSN), hint: publicEnv.NEXT_PUBLIC_SENTRY_DSN ? 'branché' : 'non branché (le journal ci-dessous suffit pour l’instant)' },
      { label: 'Adresse de l’application', ok: !/localhost/.test(publicEnv.NEXT_PUBLIC_APP_URL), hint: publicEnv.NEXT_PUBLIC_APP_URL },
    ],
    errors,
    errors7d: Number(r.errors7d),
    errorsLight: Number(r.errors7d) > 50 ? 'red' : Number(r.errors7d) > 0 ? 'orange' : 'green',
  };
}

export const overallLight = (s: TechnicalStatus): Light => worst(...s.tasks.map((t) => t.light), s.sms.light, s.db.light, s.security.light, s.errorsLight);

// ---------------------------------------------------------------------------
// Lot A (0153) : le serveur et les sauvegardes
// ---------------------------------------------------------------------------

export type Backup = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'RUNNING' | 'OK' | 'FAILED';
  trigger: 'NIGHT' | 'MANUAL';
  fileName: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  error: string | null;
  /** Le fichier est-il encore sur le disque (les plus anciennes sont effacées) ? */
  onDisk: boolean;
};

export type ServerStatus = {
  snapshot: MetricSnapshot | null;
  takenAt: string | null;
  backups: Backup[];
  backupsBytes: number;
  lights: { server: Light; processes: Light; site: Light; solver: Light; backup: Light };
};

const pct = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? (a / b) * 100 : null);
const level = (p: number | null, warn: number, bad: number): Light => (p === null ? 'green' : p >= bad ? 'red' : p >= warn ? 'orange' : 'green');

/** Un programme qui a redémarré plus de 10 fois est à surveiller : il peut ralentir tout le VPS. */
export const RESTARTS_WARN = 10;

export async function getServerStatus(): Promise<ServerStatus> {
  await requireAdmin();
  const supabase = await createClient();
  const { backupFilesOnDisk } = await import('@/services/db-backup');
  const [{ data: last }, { data: rows }, files] = await Promise.all([
    supabase.from('platform_metrics' as never).select('taken_at, data').order('taken_at', { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from('platform_backups' as never)
      .select('id, started_at, finished_at, status, trigger, file_name, size_bytes, duration_ms, error')
      .order('started_at', { ascending: false })
      .limit(14),
    backupFilesOnDisk(),
  ]);
  const onDisk = new Set(files.map((f) => f.name));
  const snap = ((last as { data: MetricSnapshot } | null)?.data ?? null) as MetricSnapshot | null;
  const takenAt = (last as { taken_at: string } | null)?.taken_at ?? null;

  const backups: Backup[] = ((rows ?? []) as {
    id: string; started_at: string; finished_at: string | null; status: Backup['status']; trigger: Backup['trigger'];
    file_name: string | null; size_bytes: number | null; duration_ms: number | null; error: string | null;
  }[]).map((b) => ({
    id: b.id, startedAt: b.started_at, finishedAt: b.finished_at, status: b.status, trigger: b.trigger, fileName: b.file_name,
    sizeBytes: b.size_bytes, durationMs: b.duration_ms, error: b.error, onDisk: !!b.file_name && onDisk.has(b.file_name),
  }));

  const now = Date.now();
  const stale = !takenAt || now - new Date(takenAt).getTime() > 20 * 60_000;
  const server = snap
    ? [level(snap.cpu, 80, 95), level(pct(snap.memUsed, snap.memTotal), 85, 95), level(pct(snap.diskUsed, snap.diskTotal), 85, 95)].reduce<Light>(
        (w, l) => (w === 'red' || l === 'red' ? 'red' : w === 'orange' || l === 'orange' ? 'orange' : 'green'),
        'green',
      )
    : 'orange';
  const processes: Light = !snap?.processes
    ? 'orange'
    : snap.processes.some((p) => p.status !== 'online' && p.name.startsWith('geschool'))
      ? 'red'
      : snap.processes.some((p) => p.status !== 'online' || p.restarts > RESTARTS_WARN)
        ? 'orange'
        : 'green';
  const site: Light = !snap ? 'orange' : snap.timings.site === null ? 'red' : snap.timings.site > 3000 ? 'red' : snap.timings.site > 1000 ? 'orange' : 'green';
  const lastOk = backups.find((b) => b.status === 'OK');
  const backup: Light =
    backups[0]?.status === 'FAILED' || !lastOk ? 'red' : now - new Date(lastOk.startedAt).getTime() > 26 * 3_600_000 ? 'red' : 'green';

  return {
    snapshot: snap,
    takenAt,
    backups,
    backupsBytes: files.reduce((n, f) => n + f.size, 0),
    lights: {
      server: stale ? 'orange' : server,
      processes: stale ? 'orange' : processes,
      site: stale ? 'orange' : site,
      solver: !snap ? 'orange' : snap.solverOk ? 'green' : 'red',
      backup,
    },
  };
}
