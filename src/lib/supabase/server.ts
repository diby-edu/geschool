import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Client Supabase serveur, agissant SOUS L'IDENTITE DE L'UTILISATEUR.
 *
 * C'est le client par defaut de toute l'application serveur (ADR-013) : la RLS
 * s'applique donc aussi au code serveur, en defense en profondeur derriere les
 * verifications RBAC applicatives.
 *
 * Ne jamais lui substituer le client admin "parce que la requete est refusee" :
 * un refus signale une policy a corriger ou un droit reellement absent.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Appel depuis un Server Component : l'ecriture de cookie y est
            // interdite. Le middleware rafraichit deja la session, cette
            // situation est donc sans consequence.
          }
        },
      },
    },
  );
}

/**
 * Utilisateur authentifie, ou null.
 *
 * Utilise getUser() et non getSession() : getSession() se contente de lire le
 * cookie, dont le contenu n'est pas verifie cote serveur. getUser() valide le
 * jeton aupres de Supabase. La distinction est une frontiere de securite.
 */
export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
