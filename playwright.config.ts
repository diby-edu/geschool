import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',

  // Un seul vCPU : la parallelisation degraderait les temps au lieu de les
  // ameliorer, et rendrait les tests instables (ADR-014).
  workers: 1,
  fullyParallel: false,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Les enseignants font l'appel sur telephone : ce parcours doit etre
    // teste sur un vrai profil mobile, pas seulement en fenetre reduite.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  // Si E2E_BASE_URL est fourni, on teste une instance deja demarree et
  // Playwright ne doit pas en lancer une. La cle est alors absente plutot que
  // definie a undefined : exactOptionalPropertyTypes distingue les deux.
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
