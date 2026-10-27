import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { schoolToday } from '@/features/dashboard/time';

/**
 * Tâche de nuit (worker) : un essai ou une année finis sans paiement passent en
 * « expiré » (public.billing_expire_due, 0143). L'état écrit en base suit ainsi
 * la date ; la coupure, elle, est lue à chaque page et ne dépend pas d'ici.
 */
export async function expireDueSubscriptions(): Promise<number> {
  const admin = createAdminClient('worker.job');
  const { data, error } = await admin.rpc('billing_expire_due' as never, { p_today: schoolToday('Africa/Abidjan') } as never);
  if (error) throw error;
  return Number(data ?? 0);
}
