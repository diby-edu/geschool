import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Configuration dediee aux tests RLS.
 *
 * Ils sont separes de `pnpm test` pour une raison simple : ils exigent une
 * VRAIE base Postgres. Les melanger aux tests unitaires ferait echouer la
 * suite sur tout poste ou en CI sans DATABASE_URL, et la reaction naturelle
 * serait de les desactiver — c'est-a-dire de perdre exactement le garde-fou
 * qui protege l'isolation entre etablissements.
 *
 *   pnpm test      unitaires, aucune dependance externe
 *   pnpm test:rls  isolation multi-tenant, base requise
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/rls/**/*.test.ts'],

    // Les suites ouvrent de vraies connexions et partagent le meme jeu de
    // donnees : leur execution doit rester serielle.
    fileParallelism: false,
    maxWorkers: 1,

    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
