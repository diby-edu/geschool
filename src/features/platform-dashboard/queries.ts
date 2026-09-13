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
  schools: { total: number; active: number; pending: number; suspended: number; new30d: number };
  students: number;
  teachers: number;
  activeSubscriptions: number;
  mrr: { amount: number; currency: string } | null;
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

  const [
    { data: schoolRows },
    { count: studentsCount },
    { count: teachersCount },
    { data: subRows },
    { data: activityRows },
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
  ]);

  const schools = (schoolRows ?? []) as { id: string; status: string; created_at: string }[];
  const schoolStats = {
    total: schools.length,
    active: schools.filter((s) => s.status === 'ACTIVE').length,
    pending: schools.filter((s) => s.status === 'PENDING').length,
    suspended: schools.filter((s) => s.status === 'SUSPENDED').length,
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

  return {
    schools: schoolStats,
    students: studentsCount ?? 0,
    teachers: teachersCount ?? 0,
    activeSubscriptions: active.length,
    mrr,
    activity,
  };
}
