import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { normalizeIdentifier } from '@/lib/auth/identifier';
import type { TenantContext } from '@/lib/tenant/context';
import { assertCanManagePerson } from './person-guard';

/**
 * Corriger l'identifiant de connexion, et déconnecter partout (0147, décidé le
 * 2026-10-26). Gestes de l'Informaticien de l'école (droits à cocher) ; le
 * Super Admin peut aussi. Jamais sur soi-même, jamais sur une personne qui a
 * plus de droits que soi (person-guard).
 */

async function guard(ctx: TenantContext, userId: string, permission: string): Promise<void> {
  requireWritable(ctx, permission);
  if (userId === ctx.user.id) throw new ValidationError('Pas sur votre propre compte : demandez à un collègue.');
  await assertCanManagePerson(ctx, userId);
}

/**
 * Nouveau numéro (connexion par téléphone) ou nouvel e-mail (connexion par
 * e-mail). Le numéro est aussi corrigé sur la fiche du parent ou de
 * l'enseignant, pour que les SMS partent au bon numéro.
 */
export async function changeLoginIdentifier(ctx: TenantContext, userId: string, raw: string): Promise<string> {
  await guard(ctx, userId, 'access_accounts.change_login');
  const admin = createAdminClient('auth.update_password');
  const { data: access } = await admin
    .from('account_access')
    .select('id, login_kind, login_identifier, subject_kind')
    .eq('school_id', ctx.school.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!access) throw new NotFoundError('Compte introuvable dans cette école.');

  const n = normalizeIdentifier(raw, ctx.school.countryCode);
  if (!n.ok) throw new ValidationError(n.reason === 'INVALID_PHONE' ? 'Numéro de téléphone invalide.' : 'Saisissez le nouvel identifiant.');
  if (access.login_kind === 'PHONE' && n.kind !== 'PHONE') throw new ValidationError('Cette personne se connecte avec un numéro de téléphone : saisissez un numéro.');
  if (access.login_kind === 'EMAIL' && n.kind !== 'EMAIL') throw new ValidationError('Cette personne se connecte avec un e-mail : saisissez une adresse e-mail.');
  if (access.login_kind === 'MATRICULE') throw new ValidationError('Un matricule ne se corrige pas ici.');
  const before = access.login_identifier;
  if (n.value === before.toLowerCase() || n.value === before) throw new ValidationError('C’est déjà son identifiant.');

  const { data: taken } = await admin
    .from('account_access')
    .select('user_id')
    .eq('school_id', ctx.school.id)
    .eq('login_identifier', n.value)
    .neq('user_id', userId)
    .limit(1);
  if (taken && taken.length > 0) throw new ConflictError('Cet identifiant sert déjà à la connexion d’une autre personne de l’école.');
  if (access.subject_kind === 'GUARDIAN') {
    const { data: otherGuardian } = await admin
      .from('guardians')
      .select('first_name, last_name')
      .eq('school_id', ctx.school.id)
      .eq('phone_e164', n.value)
      .or(`user_id.is.null,user_id.neq.${userId}`)
      .limit(1);
    const g = otherGuardian?.[0];
    if (g) throw new ConflictError(`Ce numéro est déjà celui de ${g.first_name} ${g.last_name}.`);
  }

  if (access.login_kind === 'EMAIL') {
    // L'e-mail est celui du compte lui-même : il vaut pour TOUTES ses écoles.
    const [{ data: other }, { count: schools }] = await Promise.all([
      admin.from('users').select('id').eq('auth_email', n.value).neq('id', userId).limit(1),
      admin.from('account_access').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    if (other && other.length > 0) throw new ConflictError('Cette adresse e-mail est déjà celle d’un autre compte.');
    if ((schools ?? 0) > 1 && !ctx.isPlatformAdmin) {
      throw new ValidationError('Cette personne est aussi dans une autre école : seule la plateforme peut changer son e-mail.');
    }
    const { error } = await admin.auth.admin.updateUserById(userId, { email: n.value, email_confirm: true });
    if (error) throw new ConflictError('Impossible de changer l’adresse e-mail de ce compte.');
    await admin.from('users').update({ auth_email: n.value }).eq('id', userId);
    await admin.from('account_access').update({ login_identifier: n.value }).eq('user_id', userId).eq('login_kind', 'EMAIL');
  } else {
    await admin.from('account_access').update({ login_identifier: n.value }).eq('id', access.id);
    // La fiche suit, si elle portait l'ancien numéro.
    if (access.subject_kind === 'GUARDIAN') {
      await admin.from('guardians').update({ phone_e164: n.value }).eq('school_id', ctx.school.id).eq('user_id', userId).eq('phone_e164', before);
    } else if (access.subject_kind === 'TEACHER') {
      await admin.from('teachers').update({ phone_e164: n.value }).eq('school_id', ctx.school.id).eq('user_id', userId).eq('phone_e164', before);
    }
  }

  await audit(ctx, {
    action: 'access.change_login',
    module: 'access',
    entityType: 'user',
    entityId: userId,
    before: { identifier: before },
    after: { identifier: n.value },
  });
  return n.value;
}

/** Téléphone perdu ou volé : toutes ses connexions ouvertes sont fermées, sur tous ses appareils. */
export async function signOutEverywhere(ctx: TenantContext, userId: string): Promise<void> {
  await guard(ctx, userId, 'access_accounts.sign_out');
  const admin = createAdminClient('auth.update_password');
  const { data: access } = await admin.from('account_access').select('id').eq('school_id', ctx.school.id).eq('user_id', userId).maybeSingle();
  if (!access) throw new NotFoundError('Compte introuvable dans cette école.');
  const { error } = await admin.rpc('revoke_user_sessions' as never, { p_user: userId } as never);
  if (error) throw new Error('Impossible de fermer les connexions de ce compte.');
  await audit(ctx, { action: 'access.sign_out', module: 'access', entityType: 'user', entityId: userId });
}
