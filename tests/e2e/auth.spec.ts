import { test, expect } from '@playwright/test';

/**
 * Parcours d'authentification (lot 3), contre le jeu de donnees `pnpm bootstrap`.
 *
 * Requiert une instance lancee et amorcee. En local :
 *   pnpm bootstrap
 *   E2E_BASE_URL=http://127.0.0.1:3210 pnpm test:e2e   (serveur deja demarre)
 * ou laisser Playwright demarrer `pnpm dev` (voir playwright.config.ts).
 *
 * Ces tests ne s'executent en CI que si l'infrastructure (base amorcee) est
 * disponible ; ils sont surtout un filet de non-regression pour le poste de dev.
 */

const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo-Passe-2026';

test('un non-authentifie est renvoye vers la connexion', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('connexion du personnel par email -> tableau de bord etablissement', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill('admin@demo.geschool.local');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await page.waitForURL(/\/e\/demo\/dashboard/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  // Vue personnel : les statistiques, pas la vue famille
  await expect(page.getByText('Eleves')).toBeVisible();
  await expect(page.getByText('Administrateur')).toBeVisible();
});

test('identifiants invalides : message generique, pas de fuite', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill('admin@demo.geschool.local');
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByText('Identifiant ou mot de passe incorrect.')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('un slug d etablissement inconnu renvoie 404', async ({ page }) => {
  const res = await page.goto('/e/etablissement-inexistant/login');
  expect(res?.status()).toBe(404);
});
