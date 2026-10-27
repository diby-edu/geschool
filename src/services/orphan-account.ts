import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { ValidationError } from '@/lib/errors';

/**
 * Supprimer un compte rattaché à aucune école (lot 4, 2026-10-26). Revérifié
 * ici : jamais un compte qui a une école, un accès ou le rôle de Super Admin.
 * L'appelant vérifie qu'il est Super Admin.
 */
export async function deleteOrphanAccount(userId: string): Promise<void> {
  const admin = createAdminClient('auth.delete_user');
  const [m, a, p] = await Promise.all([
    admin.from('school_memberships').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('account_access').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('platform_admins').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  if (m.error || a.error || p.error) throw new Error('Vérification du compte impossible.');
  if ((m.count ?? 0) + (a.count ?? 0) + (p.count ?? 0) > 0) {
    throw new ValidationError('Ce compte est rattaché à une école ou à la plateforme : il ne peut pas être supprimé ici.');
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error('Impossible de supprimer ce compte.');
}
