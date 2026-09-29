import { isAuthRetryableFetchError, type JwtPayload, type SupabaseClient, type User } from '@supabase/supabase-js';

const ATTEMPTS = 3;
const PAUSE_MS = 250;

/**
 * `getUser()` qui distingue « pas connecte » d'une panne du reseau.
 *
 * `getUser()` renvoie `user: null` dans les deux cas. Or un echec passager de la
 * connexion vers Supabase ne doit pas passer pour une deconnexion : la personne
 * etait renvoyee vers la page de connexion, ou voyait une erreur, puis tout
 * refonctionnait apres quelques actualisations. On rejoue donc l'appel quand la
 * panne est reseau ; sans session ou avec un jeton refuse, on s'arrete tout de
 * suite (un visiteur anonyme n'attend pas). Si les tentatives echouent toutes,
 * le resultat reste `null` : la garde ferme, comme avant.
 */
export async function getUserWithRetry(client: { auth: Pick<SupabaseClient['auth'], 'getUser'> }): Promise<User | null> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await client.auth.getUser();
    if (data.user) return data.user;
    if (attempt >= ATTEMPTS || !isAuthRetryableFetchError(error)) return null;
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
}

/**
 * Revendications du jeton de session, verifiees SANS appel reseau quand le projet
 * signe ses jetons avec une cle asymetrique (ES256) : la signature est controlee
 * localement avec la cle publique du projet, mise en cache par supabase-js. Avec
 * l'ancien secret partage (HS256), supabase-js se rabat sur getUser() (un appel).
 *
 * Ce que cela ne voit PAS : une session coupee alors que le jeton n'a pas expire
 * (acces suspendu, jusqu'a 1 h). Reserve donc au proxy, qui ne fait qu'aiguiller ;
 * l'espace etablissement refait ce controle dans app_context (migration 0057).
 * Meme regle que getUserWithRetry : une panne reseau est rejouee, un visiteur
 * sans session ou un jeton refuse ne l'est pas.
 */
export async function getClaimsWithRetry(client: {
  auth: Pick<SupabaseClient['auth'], 'getClaims'>;
}): Promise<JwtPayload | null> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await client.auth.getClaims();
    if (data?.claims) return data.claims;
    if (attempt >= ATTEMPTS || !isAuthRetryableFetchError(error)) return null;
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
}
