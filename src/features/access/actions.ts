'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { runFormAction, type FormState } from '@/lib/forms';
import { processDelivery, resendCredentials, resetAndSend } from '@/services/credentials';
import { suspendAccess, reactivateAccess } from '@/services/access-status';
import { audit } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { readSenderForSchool, readConfirmThreshold } from '@/features/sms/platform';

/**
 * Envoie l'identifiant en attente d'un compte. Traitement synchrone : sur le
 * VPS a un vCPU (ADR-014), un envoi unitaire est immediat ; l'envoi groupe
 * borne le nombre traite par requete. Le secret est genere a l'envoi (ADR-006).
 */
export async function sendAction(slug: string, userId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'access_accounts.send');
    const supabase = await createClient();
    const { data: delivery } = await supabase
      .from('credential_deliveries')
      .select('id')
      .eq('school_id', ctx.school.id)
      .eq('user_id', userId)
      .in('status', ['PENDING', 'FAILED'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (delivery) await processDelivery(ctx, delivery.id);
    redirect(`/e/${slug}/access?sent=1`);
  });
}

export async function resetAction(slug: string, userId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'access_accounts.reset');
    await resetAndSend(ctx, userId);
    await audit(ctx, { action: 'access.reset', module: 'access', entityType: 'user', entityId: userId });
    redirect(`/e/${slug}/access?reset=1`);
  });
}

/**
 * Envoi groupe des identifiants en attente. Borne a 50 par requete pour ne pas
 * saturer le vCPU ni bloquer le navigateur ; le reste se traite au clic suivant.
 *
 * Un SMS se paie. Au-dela du montant fixe par l'editeur, l'envoi demande une
 * confirmation explicite : cliquer « envoyer » ne doit pas engager cinquante
 * mille francs sans qu'on l'ait vu passer.
 */
export async function bulkSendAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'access_accounts.bulk_send');
    const supabase = await createClient();
    const { data: pending } = await supabase
      .from('credential_deliveries')
      .select('id')
      .eq('school_id', ctx.school.id)
      .in('status', ['PENDING', 'FAILED'])
      .order('created_at', { ascending: true })
      .limit(50);

    const nombre = pending?.length ?? 0;
    if (nombre === 0) redirect(`/e/${slug}/access?bulk=0`);

    const { estimate, confirmAbove, pricePerSms } = await estimateBulkCost(nombre);
    if (confirmAbove > 0 && estimate > confirmAbove && fd.get('confirmCost') !== 'oui') {
      throw new ValidationError(
        `Cet envoi coûtera environ ${estimate.toLocaleString('fr-FR')} ` +
          `(${nombre} message(s) à ${pricePerSms}). Confirmez pour lancer l’envoi.`,
      );
    }

    for (const d of pending ?? []) {
      await processDelivery(ctx, d.id);
    }
    await audit(ctx, { action: 'access.bulk_send', module: 'access', after: { count: nombre, estimate } });
    redirect(`/e/${slug}/access?bulk=${nombre}`);
  });
}

/**
 * Ce que coûtera l'envoi groupé.
 *
 * Estimation volontairement SIMPLE : un message par destinataire, au prix
 * unitaire. Le texte est nettoyé avant de partir, donc un SMS par personne
 * dans l'immense majorité des cas — et une estimation basse vaut mieux qu'une
 * promesse fausse dans l'autre sens.
 */
export async function estimateBulkCost(
  count: number,
): Promise<{ estimate: number; confirmAbove: number; pricePerSms: number }> {
  const { pricePerSms } = await readSenderForSchool();
  const seuil = await readConfirmThreshold();
  return { estimate: Math.round(pricePerSms * count), confirmAbove: seuil, pricePerSms };
}

export async function suspendAction(slug: string, userId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await suspendAccess(ctx, userId);
    redirect(`/e/${slug}/access?suspended=1`);
  });
}

export async function reactivateAction(slug: string, userId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await reactivateAccess(ctx, userId);
    redirect(`/e/${slug}/access?reactivated=1`);
  });
}

/** Renvoie les identifiants d'un acces pas encore active (nouveau mot de passe temporaire). */
export async function resendAction(slug: string, userId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'access_accounts.resend');
    await resendCredentials(ctx, userId);
    await audit(ctx, { action: 'access.resend', module: 'access', entityType: 'user', entityId: userId });
    redirect(`/e/${slug}/access?resent=1`);
  });
}
