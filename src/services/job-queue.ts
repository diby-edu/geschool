import 'server-only';

import type { PgBoss } from 'pg-boss';
import { serverEnv } from '@/lib/env';

/**
 * Confier un travail long au worker (pg-boss) depuis le site : une sauvegarde
 * ou une remise d'école prend des minutes, une page ne doit pas les attendre.
 *
 * Sur le VPS, le travail part dans la file et le worker le prend. Ailleurs (poste
 * de développement, sans worker), il tourne tout de suite dans le serveur, en
 * arrière-plan : c'est le même code, seul le lanceur change.
 */

type Job = { name: 'school-backup' | 'school-restore'; data: { id: string } };

let bossPromise: Promise<PgBoss> | null = null;

async function boss() {
  bossPromise ??= (async () => {
    const env = serverEnv();
    const { PgBoss: Boss } = await import('pg-boss');
    const b = new Boss({ connectionString: env.DATABASE_URL, schema: env.PGBOSS_SCHEMA, ssl: { rejectUnauthorized: false }, application_name: 'geschool-web', max: 2 });
    b.on('error', (e: unknown) => console.error('[file] erreur pg-boss', e));
    await b.start();
    return b;
  })();
  return bossPromise;
}

export async function runJobNow(job: Job): Promise<void> {
  const svc = await import('@/services/school-backup');
  if (job.name === 'school-backup') await svc.runBackupJob(job.data.id);
  else await svc.runRestoreJob(job.data.id);
}

export async function enqueue(job: Job): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.platform === 'linux') {
    const b = await boss();
    await b.createQueue(job.name);
    // Une heure de délai : une remise d'une grande école prend plusieurs minutes.
    await b.send(job.name, job.data, { expireInSeconds: 3600, retryLimit: 0 });
    return;
  }
  void runJobNow(job).catch((e: unknown) => console.error(`[file] ${job.name} en échec`, e));
}
