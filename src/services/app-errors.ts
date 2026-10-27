import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Journal des erreurs du serveur (page Technique, lot 7, 0151). Appelé par
 * instrumentation.ts (onRequestError). Ne lève JAMAIS : une erreur en
 * notant une erreur ne doit pas en créer une seconde pour l'utilisateur.
 */
export async function logAppError(input: { message: string; path?: string | null; digest?: string | null; detail?: string | null }): Promise<void> {
  try {
    const admin = createAdminClient('errors.log');
    await admin.rpc('log_app_error' as never, {
      p_message: input.message,
      p_path: input.path ?? null,
      p_digest: input.digest ?? null,
      p_detail: input.detail ?? null,
    } as never);
  } catch {
    // Rien : le journal est une aide, pas une condition.
  }
}
