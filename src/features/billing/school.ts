import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { getSchoolSubscription } from './platform';
import type { PaymentInput } from './schemas';

export type PaymentRow = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  reference: string | null;
  created_at: string;
  paid_at: string | null;
};

export async function getMySubscription(ctx: TenantContext) {
  return getSchoolSubscription(ctx.school.id);
}

export type UsageLine = { metric: string; label: string; used: number; limit: number };

/** Consommation courante vs quotas du plan (0 = illimité). */
export async function computeUsage(ctx: TenantContext): Promise<UsageLine[]> {
  const supabase = await createClient();
  const [students, users, sub] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', ctx.school.id).is('deleted_at', null),
    supabase.from('school_memberships').select('id', { count: 'exact', head: true }).eq('school_id', ctx.school.id).eq('status', 'ACTIVE'),
    getSchoolSubscription(ctx.school.id),
  ]);

  const { data: plan } = sub
    ? await supabase.from('plans').select('limits').eq('id', sub.plan_id).maybeSingle()
    : { data: null };
  const limits = ((plan?.limits ?? {}) as { students?: number; users?: number }) ?? {};

  return [
    { metric: 'STUDENTS', label: 'Élèves', used: students.count ?? 0, limit: limits.students ?? 0 },
    { metric: 'USERS', label: 'Comptes actifs', used: users.count ?? 0, limit: limits.users ?? 0 },
  ];
}

export async function listMyPayments(ctx: TenantContext): Promise<PaymentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('payments')
    .select('id, amount, currency, method, status, provider_reference, created_at, paid_at')
    .eq('school_id', ctx.school.id)
    .order('created_at', { ascending: false });
  return ((data ?? []) as {
    id: string;
    amount: number;
    currency: string;
    method: string;
    status: string;
    provider_reference: string | null;
    created_at: string;
    paid_at: string | null;
  }[]).map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    currency: p.currency,
    method: p.method,
    status: p.status,
    reference: p.provider_reference,
    created_at: p.created_at,
    paid_at: p.paid_at,
  }));
}

/**
 * Enregistre un paiement DÉJÀ REÇU (mobile money, espèces, virement...). C'est
 * un acte de comptabilité : aucun transfert de fonds n'est initié ici. RLS :
 * réservé au Super Admin ou à un porteur de billing.manage.
 */
export async function recordPayment(ctx: TenantContext, input: PaymentInput): Promise<void> {
  requireWritable(ctx, 'billing.manage');
  const supabase = await createClient();
  const sub = await getSchoolSubscription(ctx.school.id);
  const { error } = await supabase.from('payments').insert({
    school_id: ctx.school.id,
    subscription_id: sub?.id ?? null,
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    method: input.method,
    status: input.status,
    provider_reference: input.reference || null,
    notes: input.notes || null,
    recorded_by: ctx.user.id,
    paid_at: input.status === 'PAID' ? new Date().toISOString() : null,
  });
  if (error) throw error;
  await audit(ctx, { action: 'billing.payment_record', module: 'billing', entityType: 'payment', after: { amount: input.amount, method: input.method, status: input.status } });
}
