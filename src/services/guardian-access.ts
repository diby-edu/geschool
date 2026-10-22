import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { TenantContext } from '@/lib/tenant/context';
import { ConflictError } from '@/lib/errors';

/**
 * Le téléphone d'un responsable légal est son identifiant de connexion (code
 * école + téléphone). Le changer touche donc son accès, que le client de la
 * personne ne peut pas lire en entier (account_access d'autrui) : ces deux
 * opérations passent par le client d'administration, APRÈS le contrôle du droit
 * par l'appelant (features/students/edit.ts, guardians.update).
 */

/** Refuse un numéro déjà pris dans l'école par un autre responsable ou une autre personne. */
export async function assertGuardianPhoneFree(
  ctx: TenantContext,
  guardian: { id: string; userId: string | null },
  phone: string,
): Promise<void> {
  const admin = createAdminClient('auth.create_user');
  const [{ data: otherGuardian }, { data: otherAccess }] = await Promise.all([
    admin
      .from('guardians')
      .select('first_name, last_name')
      .eq('school_id', ctx.school.id)
      .eq('phone_e164', phone)
      .neq('id', guardian.id)
      .maybeSingle(),
    admin.from('account_access').select('user_id').eq('school_id', ctx.school.id).eq('login_identifier', phone).maybeSingle(),
  ]);
  if (otherGuardian) {
    throw new ConflictError(
      `Ce numéro est déjà celui de ${otherGuardian.first_name} ${otherGuardian.last_name}. S’il s’agit de la même personne, ajoutez-la comme responsable au lieu de modifier celui-ci.`,
    );
  }
  if (otherAccess && otherAccess.user_id !== guardian.userId) {
    throw new ConflictError('Ce numéro sert déjà à la connexion d’une autre personne de l’établissement.');
  }
}

/** Son accès suit son nouveau numéro : sans cela, il ne pourrait plus se connecter. */
export async function moveGuardianLogin(ctx: TenantContext, userId: string, phone: string): Promise<void> {
  const admin = createAdminClient('auth.create_user');
  const { error } = await admin
    .from('account_access')
    .update({ login_identifier: phone })
    .eq('school_id', ctx.school.id)
    .eq('user_id', userId)
    .eq('login_kind', 'PHONE');
  if (error) throw error;
}
