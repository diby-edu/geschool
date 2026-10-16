import 'server-only';

import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

export type RpcResult<T> = {
  data: T | null;
  /** La fonction n'existe pas encore en base : la migration correspondante n'est pas appliquee. */
  missing: boolean;
};

/**
 * Appelle une fonction SQL (`public.*`) et rend un resultat sur, sans dependre des
 * types generes (qui n'existent qu'apres `pnpm db:types`).
 *
 * - fonction absente (migration pas encore appliquee) : `{ data: null, missing: true }`,
 *   l'ecran affiche alors l'information plutot que de planter ;
 * - droit refuse (42501) : `{ data: null, missing: false }` — la fonction verifie le
 *   droit elle-meme, l'appelant ne doit rien afficher ;
 * - delai depasse (57014, gros etablissement, base froide) : `{ data: null, missing: false }`
 *   et l'erreur est journalisee — un indicateur lent ne doit pas faire tomber toute la page ;
 * - toute autre erreur : levee (elle doit se voir, jamais etre avalee).
 */
export async function callRpc<T>(supabase: Client, name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return { data: null, missing: true };
    if (error.code === '42501') return { data: null, missing: false };
    if (error.code === '57014') {
      console.error(`${name} : delai depasse (${error.message})`);
      return { data: null, missing: false };
    }
    throw new Error(`${name} : ${error.message}`);
  }
  return { data: data as T, missing: false };
}
