import { PgBoss } from 'pg-boss';
import { serverEnv } from '@/lib/env';

/**
 * Processus worker (PM2 : geschool-worker).
 *
 * Il consomme les files pg-boss et fait tourner les taches recurrentes.
 *
 * Deux taches aujourd'hui, toutes deux quotidiennes :
 *   * les ALERTES D'ABSENCE : compter les heures de chaque eleve sur la periode
 *     et prevenir au franchissement des seuils regles par l'etablissement ;
 *   * les ACCUSES DE RECEPTION SMS : demander a l'operateur ce que sont
 *     devenus les messages partis mais non confirmes, tant que l'application
 *     n'a pas d'adresse publique ou il puisse les pousser lui-meme.
 *
 * Les files de generation d'emploi du temps et d'envoi d'identifiants restent
 * declenchees depuis l'application, pas d'ici.
 */

const env = serverEnv();

async function main(): Promise<void> {
  if (!env.WORKER_ENABLED) {
    console.warn('[worker] WORKER_ENABLED=false — arret immediat.');
    return;
  }

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.PGBOSS_SCHEMA,
    ssl: { rejectUnauthorized: false },

    // Identifie le worker dans pg_stat_activity : indispensable pour savoir
    // qui tient une connexion quand la base est partagee.
    application_name: 'geschool-worker',

    // Un seul vCPU partage avec huit sites (ADR-014) : peu de connexions.
    // NB : l'intervalle de sondage est une option de `boss.work()` en pg-boss
    // 12, plus du constructeur. Il sera fixe file par file (lots 5, 7 et 10).
    max: 4,
  });

  boss.on('error', (error: unknown) => {
    console.error('[worker] erreur pg-boss', error);
  });

  await boss.start();
  console.warn(
    `[worker] demarre — schema "${env.PGBOSS_SCHEMA}", concurrence ${env.WORKER_CONCURRENCY}`,
  );

  await enregistrerTaches(boss);

  // Arret propre : laisser les jobs en cours se terminer plutot que les
  // interrompre a mi-parcours. Un envoi de SMS coupe en deux se traduirait par
  // un mot de passe change sans que le parent le recoive.
  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.warn(`[worker] ${signal} reçu, arret en cours...`);
    try {
      await boss.stop({ graceful: true, timeout: 30_000 });
      console.warn('[worker] arrete proprement.');
      process.exit(0);
    } catch (error) {
      console.error('[worker] arret force', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/**
 * Les taches recurrentes.
 *
 * pg-boss garde l'horaire en base : meme si le worker redemarre, la tache ne
 * se rejoue pas deux fois le meme jour. L'heure est fixee le matin, avant que
 * l'ecole ouvre — une alerte d'absence arrivee a 3 h du matin n'est lue par
 * personne, mais elle est prete quand le parent allume son telephone.
 */
async function enregistrerTaches(boss: PgBoss): Promise<void> {
  const ALERTES = 'attendance-alerts';
  const ACCUSES = 'sms-delivery-reports';

  await boss.createQueue(ALERTES);
  await boss.createQueue(ACCUSES);

  await boss.work(ALERTES, async () => {
    const { runAttendanceAlerts } = await import('@/services/attendance-alerts');
    const bilan = await runAttendanceAlerts();
    console.warn(
      `[worker] alertes d'absence : ${bilan.alerts} alerte(s), ${bilan.summons} convocation(s), ` +
        `${bilan.notified} personne(s) prevenue(s) sur ${bilan.schools} ecole(s)` +
        (bilan.smsSent > 0 ? `, ${bilan.smsSent} SMS pour ${bilan.smsCost}` : ''),
    );
  });

  await boss.work(ACCUSES, async () => {
    const { refreshPendingStatuses } = await import('@/services/sms-log');
    const r = await refreshPendingStatuses(200);
    console.warn(`[worker] accuses de reception : ${r.checked} verifie(s), ${r.delivered} arrive(s), ${r.failed} echec(s)`);
  });

  // 6 h 00 et 6 h 15, heure du serveur.
  await boss.schedule(ALERTES, '0 6 * * *');
  await boss.schedule(ACCUSES, '15 6 * * *');
  console.warn(
    "[worker] taches quotidiennes enregistrees : alertes d'absence (6 h), accuses de reception (6 h 15).",
  );
}

main().catch((error: unknown) => {
  console.error('[worker] demarrage impossible', error);
  process.exit(1);
});
