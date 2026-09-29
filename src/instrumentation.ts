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
