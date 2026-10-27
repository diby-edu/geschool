/**
 * Demarrage du serveur. Next.js compile ce fichier AUSSI pour le runtime Edge, ou
 * les modules Node (node:dns, undici) n'existent pas : le reglage reseau vit donc
 * dans instrumentation-node.ts, importe seulement sous Node.js. Sous cette forme
 * (condition sur NEXT_RUNTIME autour de l'import), la compilation Edge l'ecarte
 * et n'avertit plus « A Node.js module is loaded ... not supported in the Edge
 * Runtime » (voir la documentation Next.js, instrumentation).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
  }
}

/**
 * Toute erreur du serveur (page, action, route) est notée dans le journal des
 * erreurs (page Technique du Super Admin, lot 7, 0151). Sous Node.js seulement,
 * pour la même raison que plus haut ; jamais bloquant.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const e = error as { message?: string; digest?: string; stack?: string };
  const { logAppError } = await import('./services/app-errors');
  await logAppError({
    message: e?.message ?? String(error),
    path: `${request.method} ${context.routePath || request.path}`,
    digest: e?.digest ?? null,
    detail: `${context.routeType}\n${(e?.stack ?? '').slice(0, 3000)}`,
  });
}
