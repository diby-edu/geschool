import 'server-only';

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * =============================================================================
 *  CLIENT service_role — CONTOURNE L'INTEGRALITE DE LA RLS
 * =============================================================================
 *
 * Ce module est cloisonne par une regle ESLint : seuls src/workers/**,
 * src/services/** et src/lib/audit/** peuvent l'importer (ADR-013). Toute
 * autre tentative d'import fait echouer le lint.
 *
 * La liste ci-dessous est FERMEE. Y ajouter une entree est une decision
 * d'architecture, pas un contournement de blocage.
 *
 *   1. Creation d'un compte Supabase Auth (eleve, parent, personnel)
 *   2. Reinitialisation d'un mot de passe (ADR-006)
 *   3. Workers pg-boss
 *   4. Publication d'un emploi du temps et materialisation des occurrences
 *   5. Taches planifiees
 *   6. Import de masse
 *   7. Amorcage de la plateforme (seed)
 *
 * Si une operation echoue avec le client utilisateur, la reponse n'est JAMAIS
 * de passer sur celui-ci : c'est soit une policy a corriger, soit un droit
 * reellement absent.
 */

export type AdminOperation =
  | 'auth.create_user'
  | 'auth.update_password'
  | 'auth.delete_user'
  | 'auth.resolve_login'
  | 'worker.job'
  | 'schedule.publish'
  | 'cron.task'
  | 'import.bulk'
  | 'platform.seed';

let cached: SupabaseClient<Database> | null = null;

/**
 * @param operation Motif de l'appel. Obligatoire : il rend l'usage tracable a
 *                  la relecture et interdit l'appel « par reflexe ».
 */
export function createAdminClient(operation: AdminOperation): SupabaseClient<Database> {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Le client service_role a ete instancie cote navigateur. La cle serait exposee.',
    );
  }

  void operation;

  if (cached) return cached;

  cached = createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // Aucun etat de session : ce client n'agit au nom de personne.
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );

  return cached;
}
