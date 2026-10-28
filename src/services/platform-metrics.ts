import 'server-only';

import os from 'node:os';
import { statfs, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';

/**
 * Relevé de surveillance (page Technique, lot A, 0153), fait toutes les 5 min
 * par le worker sur le VPS, ou à la demande (« Relever maintenant »).
 *
 * Il ne fait QUE lire : l'état des autres projets du VPS (PM2) est lu, jamais
 * touché. Chaque mesure est indépendante : une mesure qui échoue vaut `null`
 * et n'empêche pas les autres.
 */

const run = promisify(execFile);

export type ProcessInfo = { name: string; status: string; memory: number; restarts: number; since: string | null };

export type MetricSnapshot = {
  /** Charge moyenne sur 5 min rapportée au nombre de cœurs, en %. */
  cpu: number | null;
  cores: number;
  memUsed: number;
  memTotal: number;
  swapUsed: number | null;
  swapTotal: number | null;
  diskUsed: number | null;
  diskTotal: number | null;
  uptimeSeconds: number;
  /** null : PM2 absent (poste de développement). */
  processes: ProcessInfo[] | null;
  /** Temps de réponse en ms ; null = pas de réponse. */
  timings: { site: number | null; health: number | null; db: number | null; solver: number | null };
  solverOk: boolean;
  db: { bytes: number; connections: number; maxConnections: number; cacheHit: number | null } | null;
  host: string;
};

const ms = (start: bigint) => Math.round(Number(process.hrtime.bigint() - start) / 1e6);

async function timed(url: string, timeoutMs = 10_000): Promise<number | null> {
  const start = process.hrtime.bigint();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store', redirect: 'manual' });
    await res.arrayBuffer();
    return res.status < 500 ? ms(start) : null;
  } catch {
    return null;
  }
}

/** Swap : /proc/meminfo (Linux seulement). */
async function swap(): Promise<{ used: number; total: number } | null> {
  try {
    const text = await readFile('/proc/meminfo', 'utf8');
    const kb = (k: string) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? NaN) * 1024;
    const total = kb('SwapTotal');
    const free = kb('SwapFree');
    return Number.isFinite(total) && Number.isFinite(free) ? { used: total - free, total } : null;
  } catch {
    return null;
  }
}

/** Mémoire « disponible » au sens Linux (le cache disque se libère tout seul). */
async function memAvailable(): Promise<number> {
  try {
    const text = await readFile('/proc/meminfo', 'utf8');
    const v = Number(/^MemAvailable:\s+(\d+)/m.exec(text)?.[1] ?? NaN) * 1024;
    if (Number.isFinite(v)) return v;
  } catch {
    // poste de développement
  }
  return os.freemem();
}

async function pm2Processes(): Promise<ProcessInfo[] | null> {
  try {
    const { stdout } = await run('pm2', ['jlist'], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const list = JSON.parse(stdout) as {
      name: string;
      monit?: { memory?: number };
      pm2_env?: { status?: string; restart_time?: number; pm_uptime?: number };
    }[];
    return list.map((p) => ({
      name: p.name,
      status: p.pm2_env?.status ?? 'inconnu',
      memory: p.monit?.memory ?? 0,
      restarts: p.pm2_env?.restart_time ?? 0,
      since: p.pm2_env?.pm_uptime ? new Date(p.pm2_env.pm_uptime).toISOString() : null,
    }));
  } catch {
    return null;
  }
}

/** L'adresse locale du site : le worker n'a pas de PORT, le site écoute sur 3110 (ecosystem.config.cjs). */
function siteBase(): string {
  return process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.WEB_PORT || process.env.PORT || 3110}`;
}

export async function collectSnapshot(): Promise<MetricSnapshot> {
  const admin = createAdminClient('platform.monitoring');
  const env = serverEnv();
  const base = siteBase();

  const dbStart = process.hrtime.bigint();
  const dbProbe = (async () => {
    const { data, error } = await admin.rpc('platform_db_probe' as never);
    return { data: error ? null : (data as unknown as MetricSnapshot['db']), took: error ? null : ms(dbStart) };
  })();

  const [disk, sw, avail, processes, site, health, solver, db] = await Promise.all([
    statfs('/').then((s) => ({ total: s.blocks * s.bsize, used: (s.blocks - s.bfree) * s.bsize })).catch(() => null),
    swap(),
    memAvailable(),
    pm2Processes(),
    timed(`${base}/login`),
    timed(`${base}/api/health`),
    timed(`${env.SOLVER_SERVICE_URL.replace(/\/$/, '')}/health`, 5_000),
    dbProbe.catch(() => ({ data: null, took: null })),
  ]);

  const cores = os.cpus().length || 1;
  const load = os.loadavg()[1] ?? 0;
  return {
    cpu: process.platform === 'win32' ? null : Math.round((load / cores) * 100),
    cores,
    memUsed: os.totalmem() - avail,
    memTotal: os.totalmem(),
    swapUsed: sw?.used ?? null,
    swapTotal: sw?.total ?? null,
    diskUsed: disk?.used ?? null,
    diskTotal: disk?.total ?? null,
    uptimeSeconds: Math.round(os.uptime()),
    processes,
    timings: { site, health, db: db.took, solver },
    solverOk: solver !== null,
    db: db.data,
    host: os.hostname(),
  };
}

/**
 * Seul le VPS (Linux) enregistre : la base est partagée avec le poste de
 * développement, dont le relevé se ferait passer pour celui du serveur.
 */
export const canRecordHere = () => process.platform === 'linux';

/** Relève, enregistre (sur le VPS seulement), et fait le ménage des relevés de plus de 30 jours. */
export async function recordSnapshot(): Promise<MetricSnapshot> {
  const snap = await collectSnapshot();
  if (!canRecordHere()) return snap;
  const admin = createAdminClient('platform.monitoring');
  await admin.from('platform_metrics' as never).insert({ data: snap } as never);
  await admin
    .from('platform_metrics' as never)
    .delete()
    .lt('taken_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
  return snap;
}
