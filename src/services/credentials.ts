import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSmsProvider, generateTempPassword } from '@/lib/sms';
import type { TenantContext } from '@/lib/tenant/context';
import { NotFoundError } from '@/lib/errors';

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
    .update({ must_change_password: true, account_status: 'ACTIVE' })
    .eq('school_id', ctx.school.id)
    .eq('user_id', delivery.user_id);

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
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/e/${ctx.school.slug}`;
  return (
    `[${ctx.school.shortName ?? ctx.school.name}] Votre espace est disponible.\n` +
    `Identifiant : ${identifier}\n` +
    `Mot de passe temporaire : ${password}\n` +
    `Connexion : ${url}\n` +
    `Vous devrez choisir votre mot de passe personnel a la premiere connexion.`
  );
}

/**
 * Reinitialisation d'un acces (additif §25) : cree un envoi RESET, puis le
 * traite (nouveau secret, ancien invalide, changement impose).
 */
export async function resetAndSend(ctx: TenantContext, userId: string): Promise<void> {
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
  if (!delivery) throw new NotFoundError("Impossible de creer l'envoi de reinitialisation.");

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
