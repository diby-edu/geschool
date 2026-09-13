/**
 * Configuration PM2 — usage : pm2 start ecosystem.config.cjs
 *
 * VPS MUTUALISE. Ce serveur heberge deja 10 applications PM2 et 8 sites nginx.
 * Voir docs/DEPLOYMENT.md avant toute modification.
 *
 * Ports occupes au 10/09/2026 : 3000-3007, 3100, 9101.
 * Ce projet reserve 3110 (web) et 8110 (solveur, conteneur Docker).
 * Verifier avant de changer :   ss -tlnp | grep LISTEN   et   pm2 list
 */

// Node 22 installe via nvm, dedie a ce projet. Le Node systeme (v20.19.6) reste
// celui des autres projets : ne pas y toucher, plusieurs applications en
// dependent.
const NODE_22 = '/root/.nvm/versions/node/v22.23.1/bin/node';

module.exports = {
  apps: [
    {
      name: 'geschool',
      // L'artefact `.next/standalone` est deploye DECOMPRESSE a la racine de
      // `current` (server.js, .next/, node_modules...) — cf. scripts/deploy.sh.
      script: 'server.js',
      interpreter: NODE_22,
      cwd: '/var/www/geschool/current',

      // Une seule instance. Le mode cluster est PROSCRIT ici : sur un vCPU
      // unique il multiplierait la memoire sans gagner de debit (ADR-014).
      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        PORT: 3110,
        // Ecoute limitee a localhost : joignable uniquement via nginx
        HOSTNAME: '127.0.0.1',
        // Le worker tourne dans son propre process, pas dans le serveur web
        WORKER_ENABLED: 'false',
      },

      // 2,5 Go disponibles a partager avec 10 applications
      max_memory_restart: '400M',

      // Un redemarrage en boucle ne doit pas saturer le CPU des autres sites
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 200,

      merge_logs: true,
      time: true,
    },

    {
      name: 'geschool-worker',
      // Worker compile en un seul fichier par esbuild (pnpm build:worker),
      // execute par Node avec chargement du .env.local (les secrets ne sont pas
      // dans l'env PM2). Aucune dependance a tsx en production.
      script: 'worker.js',
      interpreter: NODE_22,
      interpreter_args: '--env-file=.env.local',
      cwd: '/var/www/geschool/current',

      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        WORKER_ENABLED: 'true',
        // Un seul vCPU : deux jobs simultanes suffisent, et jamais deux
        // generations d'emploi du temps (SOLVER_MAX_CONCURRENT_JOBS=1).
        WORKER_CONCURRENCY: '2',
      },

      max_memory_restart: '250M',
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 5000,

      merge_logs: true,
      time: true,
    },
  ],
};
