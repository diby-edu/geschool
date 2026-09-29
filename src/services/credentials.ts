import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSmsProvider, generateTempPassword } from '@/lib/sms';
import { formatPhoneForDisplay } from '@/lib/auth/identifier';
import type { TenantContext } from '@/lib/tenant/context';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { assertCanManagePerson, assertCanResetAccess } from './person-guard';

/**
 * Traitement d'un envoi d'identifiants (ADR-006). Le mot de passe temporaire
 * est genere ICI, en memoire, jamais avant et jamais persiste : ni en base, ni
 * en log applicatif, ni en audit. La sequence :
 *
 *   generer le secret -> definir le mot de passe (Admin API) -> rendre le SMS
 *   -> envoyer -> marquer SENT -> access_event. Le secret sort ensuite de la
 *   portee.
 */
export async function processDelivery(ctx: TenantContext, deliveryId: string): Promise<void> {
  const admin = createAdminClient('auth.update_password');

  // Verrouiller l'envoi : PENDING/FAILED -> PROCESSING
  const { data: delivery } = await admin
    .from('credential_deliveries')
    .update({ status: 'PROCESSING', last_attempt_at: new Date().toISOString() })
    .eq('id', deliveryId)
    .eq('school_id', ctx.school.id)
    .in('status', ['PENDING', 'FAILED'])
    .select('id, user_id, recipient, reason, channel, attempts')
    .maybeSingle();

  if (!delivery) return; // deja traite, ou introuvable — idempotent

  // Identifiant humain (telephone) et nom, pour le message
  const { data: access } = await admin
    .from('account_access')
    .select('login_identifier, login_kind')
    .eq('school_id', ctx.school.id)
    .eq('user_id', delivery.user_id)
    .maybeSingle();

  const tempPassword = generateTempPassword();

  // 1. Definir le mot de passe temporaire + forcer le changement
  const { error: pwError } = await admin.auth.admin.updateUserById(delivery.user_id, {
    password: tempPassword,
    app_metadata: { must_change_password: true },
  });
  if (pwError) {
    await markFailed(admin, deliveryId, 'AUTH_UPDATE', pwError.message);
    return;
  }
  await admin
    .from('account_access')
    .update({ must_change_password: true })
    .eq('school_id', ctx.school.id)
    .eq('user_id', delivery.user_id);
  // « Cree » devient « actif » a l'envoi ; un acces SUSPENDU le reste (seule la
  // reactivation explicite le rouvre).
  await admin
    .from('account_access')
    .update({ account_status: 'ACTIVE' })
    .eq('school_id', ctx.school.id)
    .eq('user_id', delivery.user_id)
    .eq('account_status', 'CREATED');

  // 2. Rendre et envoyer le SMS
  const body = renderSms(ctx, access?.login_identifier ?? delivery.recipient, tempPassword);
  const result = await getSmsProvider().send({
    to: delivery.recipient,
    body,
    reference: deliveryId,
  });
  // Le secret n'est plus utilise au-dela de ce point.

  if (!result.ok) {
    await markFailed(admin, deliveryId, result.errorCode, result.errorMessage, result.permanent);
    return;
  }

  // 3. Marquer SENT + evenement + compteur
  await admin
    .from('credential_deliveries')
    .update({
      status: 'SENT',
      provider: result.provider,
      provider_message_id: result.providerMessageId,
      sent_at: new Date().toISOString(),
      attempts: delivery.attempts + 1,
    })
    .eq('id', deliveryId);

  await admin.from('access_events').insert({
    school_id: ctx.school.id,
    user_id: delivery.user_id,
    event_type: 'CREDENTIALS_SENT',
    actor_id: ctx.user.id,
    metadata: { channel: delivery.channel, reason: delivery.reason },
  });

  // Compteur d'envois sur le compte (lecture indicative dans le module Acces)
  const { data: acc } = await admin
    .from('account_access')
    .select('delivery_count')
    .eq('school_id', ctx.school.id)
    .eq('user_id', delivery.user_id)
    .maybeSingle();
  if (acc) {
    await admin
      .from('account_access')
      .update({ delivery_count: acc.delivery_count + 1 })
      .eq('school_id', ctx.school.id)
      .eq('user_id', delivery.user_id);
  }
}

async function markFailed(
  admin: ReturnType<typeof createAdminClient>,
  deliveryId: string,
  code: string,
  message: string,
  permanent = false,
): Promise<void> {
  const nextAttempt = permanent ? null : new Date(Date.now() + 5 * 60_000).toISOString();
  await admin
    .from('credential_deliveries')
    .update({
      status: 'FAILED',
      error_code: code,
      error_message: message.slice(0, 500),
      next_attempt_at: nextAttempt ?? new Date(Date.now() + 6 * 3600_000).toISOString(),
    })
    .eq('id', deliveryId);
}

function renderSms(ctx: TenantContext, identifier: string, password: string): string {
  // Page de connexion unique : le lien porte le code ecole, deja rempli.
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login?code=${ctx.school.loginCode}`;
  const shown = identifier.startsWith('+') ? formatPhoneForDisplay(identifier, ctx.school.countryCode) : identifier;
  return (
    `[${ctx.school.shortName ?? ctx.school.name}] Votre espace est disponible.\n` +
    `Code école : ${ctx.school.loginCode}\n` +
    `Identifiant : ${shown}\n` +
    `Mot de passe temporaire : ${password}\n` +
    `Connexion : ${url}\n` +
    `Vous devrez choisir votre mot de passe personnel à la première connexion.`
  );
}

/**
 * Reinitialisation d'un acces (additif §25) : cree un envoi RESET, puis le
 * traite (nouveau secret, ancien invalide, changement impose).
 */
export async function resetAndSend(ctx: TenantContext, userId: string): Promise<void> {
  requireWritable(ctx, 'access_accounts.reset');
  await assertCanResetAccess(ctx, userId);
  const admin = createAdminClient('auth.update_password');

  const { data: access } = await admin
    .from('account_access')
    .select('id, login_identifier, login_kind, reset_count')
    .eq('school_id', ctx.school.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!access) throw new NotFoundError('Compte introuvable.');

  // Destinataire : le numero enregistre pour un compte telephone, sinon email
  const recipient = access.login_identifier;

  const { data: delivery } = await admin
    .from('credential_deliveries')
    .insert({
      school_id: ctx.school.id,
      user_id: userId,
      reason: 'RESET',
      channel: access.login_kind === 'PHONE' ? 'SMS' : 'EMAIL',
      recipient,
      status: 'PENDING',
      idempotency_key: `reset-${userId}-${Date.now()}`,
    })
    .select('id')
    .single();
  if (!delivery) throw new NotFoundError("Impossible de créer l'envoi de réinitialisation.");

  await admin
    .from('account_access')
    .update({ last_reset_at: new Date().toISOString(), reset_count: access.reset_count + 1 })
    .eq('id', access.id);

  await admin.from('access_events').insert({
    school_id: ctx.school.id,
    user_id: userId,
    event_type: 'PASSWORD_RESET',
    actor_id: ctx.user.id,
  });

  await processDelivery(ctx, delivery.id);
}

export type RevealedCredentials = {
  name: string;
  /** Identifiant tel qu'on le saisit (telephone d'affichage ou e-mail). */
  identifier: string;
  password: string;
  schoolCode: string;
  loginUrl: string;
  /** L'acces etait deja actif : l'ancien mot de passe personnel ne fonctionne plus. */
  replacedPersonalPassword: boolean;
};

/**
 * Remise EN MAIN PROPRE des identifiants : genere un nouveau mot de passe
 * temporaire et le RENVOIE a l'appelant, qui l'affiche UNE SEULE FOIS. Aucun SMS.
 * A utiliser tant qu'aucun operateur SMS n'est branche, ou pour remettre un
 * identifiant de vive voix.
 *
 * ADR-006 tient toujours : le secret n'est ni stocke, ni journalise, ni audite ;
 * il n'existe qu'ici, en memoire, le temps de la reponse. L'ancien mot de passe
 * cesse de fonctionner et la personne devra en choisir un a sa premiere connexion.
 *
 * Garde-fous : droit de reinitialisation, jamais pour soi-meme, et seulement pour
 * une personne dont les droits sont inclus dans ceux de l'appelant (sinon un
 * informaticien afficherait le mot de passe du directeur et se connecterait a sa
 * place — voir person-guard.ts).
 */
export async function revealTemporaryPassword(ctx: TenantContext, userId: string): Promise<RevealedCredentials> {
  requireWritable(ctx, 'access_accounts.reset');
  if (userId === ctx.user.id) {
    throw new ValidationError("Vous ne pouvez pas afficher un mot de passe temporaire pour votre propre accès.");
  }
  await assertCanManagePerson(ctx, userId);

  const admin = createAdminClient('auth.update_password');
  const { data: access } = await admin
    .from('account_access')
    .select('id, login_identifier, login_kind, account_status, activation_status, reset_count, delivery_count')
    .eq('school_id', ctx.school.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!access) throw new NotFoundError('Compte introuvable.');
  if (access.account_status === 'SUSPENDED') {
    throw new ValidationError('Cet accès est suspendu : reactivez-le avant de remettre un mot de passe.');
  }
  const { data: person } = await admin
    .from('users')
    .select('first_name, last_name, display_name')
    .eq('id', userId)
    .maybeSingle();

  const password = generateTempPassword();
  const { error: pwError } = await admin.auth.admin.updateUserById(userId, {
    password,
    app_metadata: { must_change_password: true },
  });
  if (pwError) throw new Error('Impossible de définir le mot de passe temporaire.');

  const wasActivated = access.activation_status === 'ACTIVATED';
  const now = new Date().toISOString();
  await admin
    .from('account_access')
    .update({
      must_change_password: true,
      // « Cree » devient « actif » des la remise ; un acces active le reste.
      account_status: 'ACTIVE',
      delivery_count: access.delivery_count + 1,
      ...(wasActivated ? { last_reset_at: now, reset_count: access.reset_count + 1 } : {}),
    })
    .eq('id', access.id);

  // Un SMS encore en attente n'a plus d'objet : le secret vient d'etre remis. On
  // l'annule, sinon son envoi genererait un AUTRE mot de passe et invaliderait
  // celui-ci sans prevenir personne.
  await admin
    .from('credential_deliveries')
    .update({ status: 'CANCELLED' })
    .eq('school_id', ctx.school.id)
    .eq('user_id', userId)
    .in('status', ['PENDING', 'FAILED']);
  await admin.from('credential_deliveries').insert({
    school_id: ctx.school.id,
    user_id: userId,
    reason: wasActivated ? 'RESET' : 'INITIAL',
    channel: 'PRINT',
    recipient: access.login_identifier,
    status: 'SENT',
    provider: 'main-propre',
    sent_at: now,
    idempotency_key: `main-propre-${userId}-${Date.now()}`,
    requested_by: ctx.user.id,
  });
  await admin.from('access_events').insert({
    school_id: ctx.school.id,
    user_id: userId,
    event_type: wasActivated ? 'PASSWORD_RESET' : 'CREDENTIALS_SENT',
    actor_id: ctx.user.id,
    metadata: { channel: 'PRINT', handover: 'in_person' },
  });
  await audit(ctx, {
    action: 'access.reveal_temporary_password',
    module: 'access',
    entityType: 'user',
    entityId: userId,
    after: { replacedPersonalPassword: wasActivated },
  });

  const shown =
    access.login_kind === 'PHONE' && access.login_identifier.startsWith('+')
      ? formatPhoneForDisplay(access.login_identifier, ctx.school.countryCode)
      : access.login_identifier;
  return {
    name: person?.display_name ?? `${person?.first_name ?? ''} ${person?.last_name ?? ''}`.trim(),
    identifier: shown,
    password,
    schoolCode: ctx.school.loginCode,
    loginUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login?code=${ctx.school.loginCode}`,
    replacedPersonalPassword: wasActivated,
  };
}

/**
 * Renvoi des identifiants d'un acces PAS ENCORE ACTIVE (SMS perdu, numero mal
 * saisi puis corrige...). Genere un NOUVEAU mot de passe temporaire : l'ancien
 * cesse de fonctionner. Un acces deja active ne se renvoie pas — la personne a
 * son propre mot de passe, on le reinitialise (resetAndSend).
 */
export async function resendCredentials(ctx: TenantContext, userId: string): Promise<void> {
  requireWritable(ctx, 'access_accounts.resend');
  await assertCanResetAccess(ctx, userId);
  const admin = createAdminClient('auth.update_password');

  const { data: access } = await admin
    .from('account_access')
    .select('login_identifier, login_kind, activation_status, account_status')
    .eq('school_id', ctx.school.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!access) throw new NotFoundError('Compte introuvable.');
  if (access.activation_status === 'ACTIVATED') {
    throw new ValidationError('Cet accès est déjà active : utilisez « Réinitialiser ».');
  }
  if (access.account_status === 'SUSPENDED') {
    throw new ValidationError("Cet accès est suspendu : reactivez-le avant de renvoyer les identifiants.");
  }

  const { data: delivery } = await admin
    .from('credential_deliveries')
    .insert({
      school_id: ctx.school.id,
      user_id: userId,
      reason: 'RESEND',
      channel: access.login_kind === 'PHONE' ? 'SMS' : 'EMAIL',
      recipient: access.login_identifier,
      status: 'PENDING',
      idempotency_key: `resend-${userId}-${Date.now()}`,
    })
    .select('id')
    .single();
  if (!delivery) throw new NotFoundError("Impossible de créer l'envoi.");

  await processDelivery(ctx, delivery.id);
}
