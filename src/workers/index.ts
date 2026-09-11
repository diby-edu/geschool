import { PgBoss } from 'pg-boss';
import { serverEnv } from '@/lib/env';

/**
 * Processus worker (PM2 : geschool-worker).
 *
 * Il consomme les files pg-boss : generation d'emploi du temps, envoi des
 * identifiants, rendu des bulletins, imports, maintenance.
 *
 * AUCUN GESTIONNAIRE N'EST ENCORE ENREGISTRE. Les files arrivent avec les lots
 * qui les justifient (5, 7, 10). Le processus demarre, se connecte et attend :
 * c'est son etat normal a ce stade, et il vaut mieux le dire que simuler une
 * activite inexistante.
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
  console.warn('[worker] aucune file enregistree a ce stade (lots 5, 7 et 10).');

  // Arret propre : laisser les jobs en cours se terminer plutot que les
  // interrompre a mi-parcours. Un envoi de SMS coupe en deux se traduirait par
  // un mot de passe change sans que le parent le recoive.
  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.warn(`[worker] ${signal} recu, arret en cours...`);
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

main().catch((error: unknown) => {
  console.error('[worker] demarrage impossible', error);
  process.exit(1);
});
