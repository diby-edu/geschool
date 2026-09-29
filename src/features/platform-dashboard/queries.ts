import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { activityLabel } from '@/lib/audit/labels';

/**
 * Vue d'ensemble plateforme (Super Admin). Toutes les requetes s'appuient sur
 * le client RLS : `app.is_platform_admin()` leve deja le cloisonnement par
 * etablissement dans chaque policy select (ADR-007) — aucun besoin du client
 * service_role ici, uniquement de la lecture.
 */

export type PlatformOverview = {
  schools: { total: number; active: number; pending: number; suspended: number; archived: number; new30d: number };
  students: number;
  teachers: number;
  activeSubscriptions: number;
  mrr: { amount: number; currency: string } | null;
  /** Ce qui attend une décision de la plateforme : règlements déclarés par les écoles. */
  pendingPayments: { count: number; amount: number; currency: string | null };
  /** Abonnements à surveiller : essais qui se terminent, échéances dépassées. */
  trialsEndingSoon: number;
  pastDue: number;
  /** Écoles dont au moins un module a été coupé (formule réduite ou incident). */
  schoolsWithDisabledModules: number;
  activity: { id: string; label: string; schoolName: string | null; at: string }[];
};

const MONTHLY_DIVISOR: Record<string, number | null> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
  ONE_TIME: null, // pas recurrent : exclu du MRR
};

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const supabase = await createClient();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const in30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: schoolRows },
    { count: studentsCount },
    { count: teachersCount },
    { data: subRows },
    { data: activityRows },
    { data: paymentRows },
    { count: trialsCount },
    { count: pastDueCount },
    { data: disabledRows },
  ] = await Promise.all([
    supabase.from('schools').select('id, status, created_at'),
    supabase.from('students').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('teachers').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase
      .from('subscriptions')
      .select('status, plans(price_amount, currency, billing_period)')
      .in('status', ['ACTIVE', 'TRIALING']),
    supabase
      .from('audit_logs')
      .select('id, action, module, created_at, schools(name)')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('payments').select('amount, currency').eq('status', 'PENDING'),
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'TRIALING')
      .lte('trial_ends_at', in30d),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'PAST_DUE'),
    supabase.from('school_features').select('school_id').eq('is_enabled', false),
  ]);

  const schools = (schoolRows ?? []) as { id: string; status: string; created_at: string }[];
  const schoolStats = {
    total: schools.length,
    active: schools.filter((s) => s.status === 'ACTIVE').length,
    pending: schools.filter((s) => s.status === 'PENDING').length,
    suspended: schools.filter((s) => s.status === 'SUSPENDED').length,
    archived: schools.filter((s) => s.status === 'ARCHIVED').length,
    new30d: schools.filter((s) => s.created_at >= since30d).length,
  };

  const subs = (subRows ?? []) as unknown as {
    status: string;
    plans: { price_amount: number; currency: string; billing_period: string } | null;
  }[];
  const active = subs.filter((s) => s.status === 'ACTIVE');
  const currencies = new Set(active.map((s) => s.plans?.currency).filter(Boolean));
  let mrr: PlatformOverview['mrr'] = null;
  if (currencies.size === 1) {
    let sum = 0;
    for (const s of active) {
      if (!s.plans) continue;
      const divisor = MONTHLY_DIVISOR[s.plans.billing_period];
      if (divisor) sum += Number(s.plans.price_amount) / divisor;
    }
    mrr = { amount: Math.round(sum), currency: [...currencies][0] as string };
  }

  const activity = ((activityRows ?? []) as unknown as {
    id: string;
    action: string;
    module: string;
    created_at: string;
    schools: { name: string } | null;
  }[]).map((r) => ({
    id: r.id,
    label: activityLabel(r.action, r.module).label,
    schoolName: r.schools?.name ?? null,
    at: r.created_at,
  }));

  // Les règlements déclarés attendent une confirmation : c'est le seul chiffre
  // du tableau de bord qui appelle un GESTE, pas seulement un constat.
  const payments = (paymentRows ?? []) as { amount: number; currency: string }[];
  const paymentCurrencies = new Set(payments.map((p) => p.currency));
  const pendingPayments = {
    count: payments.length,
    amount: Math.round(payments.reduce((sum, p) => sum + Number(p.amount), 0)),
    currency: paymentCurrencies.size === 1 ? ([...paymentCurrencies][0] as string) : null,
  };

  return {
    schools: schoolStats,
    students: studentsCount ?? 0,
    teachers: teachersCount ?? 0,
    activeSubscriptions: active.length,
    mrr,
    pendingPayments,
    trialsEndingSoon: trialsCount ?? 0,
    pastDue: pastDueCount ?? 0,
    schoolsWithDisabledModules: new Set(((disabledRows ?? []) as { school_id: string }[]).map((r) => r.school_id)).size,
    activity,
  };
}
