'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { runFormAction, type FormState } from '@/lib/forms';
import { processDelivery, resetAndSend } from '@/services/credentials';
import { audit } from '@/lib/audit';

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
 */
export async function bulkSendAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
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
    for (const d of pending ?? []) {
      await processDelivery(ctx, d.id);
    }
    await audit(ctx, { action: 'access.bulk_send', module: 'access', after: { count: pending?.length ?? 0 } });
    redirect(`/e/${slug}/access?bulk=1`);
  });
}
