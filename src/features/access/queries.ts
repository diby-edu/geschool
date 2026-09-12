import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type AccessIndicators = {
  students: number;
  guardians: number;
  activated: number;
  notActivated: number;
  pending: number;
  sent: number;
  failed: number;
};

export type AccessRow = {
  user_id: string;
  name: string;
  subject_kind: string;
  login_identifier: string;
  activation_status: string;
  account_status: string;
  delivery_count: number;
  has_pending: boolean;
};

async function countAccess(ctx: TenantContext, filter: Record<string, string>): Promise<number> {
  const supabase = await createClient();
  let q = supabase.from('account_access').select('user_id', { count: 'exact', head: true }).eq('school_id', ctx.school.id);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}

async function countDeliveries(ctx: TenantContext, status: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('credential_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', ctx.school.id)
    .eq('status', status as never);
  return count ?? 0;
}

export async function getIndicators(ctx: TenantContext): Promise<AccessIndicators> {
  const [students, guardians, activated, notActivated, pending, sent, failed] = await Promise.all([
    countAccess(ctx, { subject_kind: 'STUDENT' }),
    countAccess(ctx, { subject_kind: 'GUARDIAN' }),
    countAccess(ctx, { activation_status: 'ACTIVATED' }),
    countAccess(ctx, { activation_status: 'NOT_ACTIVATED' }),
    countDeliveries(ctx, 'PENDING'),
    countDeliveries(ctx, 'SENT'),
    countDeliveries(ctx, 'FAILED'),
  ]);
  return { students, guardians, activated, notActivated, pending, sent, failed };
}

export async function listAccounts(
  ctx: TenantContext,
  filter: { subjectKind?: string | undefined; activation?: string | undefined; q?: string | undefined },
): Promise<AccessRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from('account_access')
    .select(
      'user_id, subject_kind, login_identifier, activation_status, account_status, delivery_count, users!account_access_user_id_fkey(display_name, first_name, last_name)',
    )
    .eq('school_id', ctx.school.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (filter.subjectKind) q = q.eq('subject_kind', filter.subjectKind as never);
  if (filter.activation) q = q.eq('activation_status', filter.activation as never);
  if (filter.q) q = q.ilike('login_identifier', `%${filter.q}%`);

  const { data, error } = await q;
  if (error) throw error;

  // Comptes ayant un envoi en attente ou en echec
  const { data: pend } = await supabase
    .from('credential_deliveries')
    .select('user_id')
    .eq('school_id', ctx.school.id)
    .in('status', ['PENDING', 'FAILED']);
  const pendingSet = new Set((pend ?? []).map((p) => p.user_id));

  return ((data ?? []) as unknown as {
    user_id: string;
    subject_kind: string;
    login_identifier: string;
    activation_status: string;
    account_status: string;
    delivery_count: number;
    users: { display_name: string | null; first_name: string; last_name: string } | null;
  }[]).map((r) => ({
    user_id: r.user_id,
    name:
      (r.users?.display_name ??
        `${r.users?.first_name ?? ''} ${r.users?.last_name ?? ''}`.trim()) ||
      '—',
    subject_kind: r.subject_kind,
    login_identifier: r.login_identifier,
    activation_status: r.activation_status,
    account_status: r.account_status,
    delivery_count: r.delivery_count,
    has_pending: pendingSet.has(r.user_id),
  }));
}
