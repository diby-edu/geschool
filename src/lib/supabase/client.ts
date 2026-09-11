'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Client Supabase du navigateur.
 *
 * Utilise la cle anon : toutes les requetes sont soumises a la RLS. C'est
 * volontaire et suffisant — la securite ne repose jamais sur le fait que le
 * navigateur "ne demande pas" une donnee, mais sur le refus de Postgres.
 *
 * A reserver aux interactions temps reel et aux formulaires purement clients.
 * Les lectures de page passent par les Server Components, et les ecritures par
 * les Server Actions, ou les permissions sont verifiees avant la requete.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
