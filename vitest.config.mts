import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    // tests/rls exige une VRAIE base : il est lance separement par
    // `pnpm test:rls`, et en CI seulement si un DATABASE_URL est configure.
    // L'inclure ici ferait echouer `pnpm test` sur tout poste sans base.
    exclude: ['node_modules', '.next', 'tests/e2e/**', 'tests/rls/**'],

    // Les tests RLS ouvrent de vraies connexions Postgres et doivent
    // s'executer en serie : deux suites concurrentes se marcheraient dessus
    // sur les memes jeux de donnees.
    //
    // Un seul vCPU sur le VPS et sur la CI : le parallelisme couterait plus
    // qu'il ne rapporte (ADR-014).
    fileParallelism: false,
    maxWorkers: 1,

    testTimeout: 20_000,
    hookTimeout: 30_000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/features/**/service.ts', 'src/services/**'],
      exclude: ['**/*.test.ts', '**/components/**'],
    },
  },
});
