import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { TenantContext } from '@/lib/tenant/context';
import { assertCanManagePerson } from './person-guard';

/**
 * Suspension / reactivation d'un acces (enseignant, parent).
 *
 * Suspendre = la personne ne peut plus se connecter, TOUT DE SUITE :
 *   - account_access.account_status = SUSPENDED (la resolution de l'identifiant
 *     ne la trouve plus, cf. migration 0047) ;
 *   - le compte d'authentification est banni (aucune connexion ni renouvellement
 *     de jeton) et ses sessions ouvertes sont coupees.
 * Comme un acces = une personne, la suspension vaut pour tous ses roles dans
 * l'etablissement (une personne enseignante ET parent perd les deux espaces).
 *
 * Personnel administratif : suspendable depuis la page Personnel. On ne suspend
 * ni le fondateur, ni soi-meme, ni une personne dont la fonction contient des
 * droits qu'on ne possede pas (services/person-guard.ts) : sans cela, un
 * informaticien pourrait verrouiller le directeur. La page Gestion des acces, elle,
 * ne propose pas le bouton pour le personnel.
 */

const SUSPENDABLE_KINDS = ['TEACHER', 'GUARDIAN', 'STUDENT', 'STAFF'];
const BAN_PERMANENT = '876000h'; // ~100 ans : « jusqu'a reactivation »

async function loadAccess(ctx: TenantContext, userId: string) {
  const admin = createAdminClient('auth.update_password');
  const { data: access } = await admin
    .from('account_access')
    .select('id, subject_kind, account_status, activation_status')
    .eq('school_id', ctx.school.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!access) throw new NotFoundError('Compte introuvable.');
  if (!SUSPENDABLE_KINDS.includes(access.subject_kind)) {
    throw new ValidationError("Cet accès ne peut pas être suspendu depuis Gestion des accès.");
  }
  return { admin, access };
}

export async function suspendAccess(ctx: TenantContext, userId: string): Promise<void> {
  requireWritable(ctx, 'access_accounts.disable');
  if (userId === ctx.user.id) throw new ValidationError('Vous ne pouvez pas suspendre votre propre accès.');

  const { admin, access } = await loadAccess(ctx, userId);
  await assertCanManagePerson(ctx, userId);
  if (access.account_status === 'SUSPENDED') return;

  await admin.from('account_access').update({ account_status: 'SUSPENDED' }).eq('id', access.id);
  await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_PERMANENT });
  await admin.rpc('revoke_user_sessions' as never, { p_user: userId } as never);
  await admin.from('access_events').insert({
    school_id: ctx.school.id,
    user_id: userId,
    event_type: 'ACCOUNT_SUSPENDED',
    actor_id: ctx.user.id,
  });
  await audit(ctx, { action: 'access.suspend', module: 'access', entityType: 'user', entityId: userId });
}

export async function reactivateAccess(ctx: TenantContext, userId: string): Promise<void> {
  requireWritable(ctx, 'access_accounts.reactivate');

  const { admin, access } = await loadAccess(ctx, userId);
  await assertCanManagePerson(ctx, userId);
  if (access.account_status !== 'SUSPENDED') return;

  // Un acces jamais active (mot de passe personnel pas encore choisi) retrouve
  // son etat d'avant : « cree », pas « actif ».
  const restored = access.activation_status === 'ACTIVATED' ? 'ACTIVE' : 'CREATED';
  await admin.from('account_access').update({ account_status: restored }).eq('id', access.id);
  await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  await admin.from('access_events').insert({
    school_id: ctx.school.id,
    user_id: userId,
    event_type: 'ACCOUNT_REACTIVATED',
    actor_id: ctx.user.id,
  });
  await audit(ctx, { action: 'access.reactivate', module: 'access', entityType: 'user', entityId: userId });
}
