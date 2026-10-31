import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { hasAnyPermission, hasPermission } from '@/lib/permissions';
import { createShortMemo } from '@/lib/short-memo';
import { daysUntil, readBilling } from '@/features/billing/subscription';
import { readSmsQuota } from '@/features/sms/quota';
import { schoolToday } from '@/features/dashboard/time';

/**
 * Les ALERTES d'une école (maquette, partie 4) : ce qui ne va pas maintenant,
 * et le reste tant que le problème dure — contrairement aux notifications, qui
 * se lisent. Calculées à la lecture, selon les droits de la personne :
 *
 *   abonnement bientôt échu ou échu      qui suit l'abonnement (billing.view)
 *   crédit SMS de l'école presque épuisé  idem
 *   beaucoup d'appels non faits aujourd'hui  appels non faits / toutes les présences
 *   notes pas saisies à 3 jours de l'arrêt   toutes les notes (grades.view_all)
 *
 * Gardées 5 minutes en mémoire par école et par jeu de droits : la cloche
 * s'affiche sur chaque page.
 */

export type SchoolAlert = { key: string; icon: string; title: string; body: string; href: string; tone: 'danger' | 'warning' };

const memo = createShortMemo<SchoolAlert[]>(5 * 60_000);

/** Au-delà, la vie scolaire est alertée : quelques oublis par jour restent normaux. */
const MISSING_CALLS_ALERT = 5;
const RENEW_SOON_DAYS = 14;

export function loadSchoolAlerts(ctx: TenantContext): Promise<SchoolAlert[]> {
  const billing = hasPermission(ctx, 'billing.view');
  const calls = hasAnyPermission(ctx, ['attendance.missing_calls', 'attendance.view_all']);
  const grades = hasPermission(ctx, 'grades.view_all');
  if (!billing && !calls && !grades) return Promise.resolve([]);
  const key = `${ctx.school.id}|${Number(billing)}${Number(calls)}${Number(grades)}`;
  return memo(key, () => compute(ctx, { billing, calls, grades })).catch(() => []);
}

async function compute(ctx: TenantContext, can: { billing: boolean; calls: boolean; grades: boolean }): Promise<SchoolAlert[]> {
  const base = `/e/${ctx.school.slug}`;
  const today = schoolToday(ctx.school.timezone, new Date());
  const supabase = await createClient();
  const out: SchoolAlert[] = [];

  const [billing, quota, missing, closing] = await Promise.all([
    can.billing ? readBilling(ctx, 1).catch(() => null) : null,
    can.billing ? readSmsQuota(ctx).catch(() => null) : null,
    can.calls
      ? supabase.rpc('missing_calls' as never, { p_school: ctx.school.id, p_from: today, p_to: today, p_now: new Date().toISOString() } as never)
      : null,
    can.grades && ctx.academicYear
      ? supabase
          .from('academic_periods')
          .select('id, name, grades_stop_on')
          .eq('school_id', ctx.school.id)
          .eq('academic_year_id', ctx.academicYear.id)
          .gte('grades_stop_on', today)
          .lte('grades_stop_on', new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10))
      : null,
  ]);

  if (billing) {
    for (const m of billing.modules) {
      const left = daysUntil(m.endsOn);
      if (m.expired) {
        out.push({ key: `billing-${m.code}`, icon: '💳', tone: 'danger', title: `${m.name} : abonnement échu`, body: 'Renouvelez-le pour ne pas perdre l’accès.', href: `${base}/facturation` });
      } else if (left !== null && left <= RENEW_SOON_DAYS) {
        out.push({ key: `billing-${m.code}`, icon: '💳', tone: 'warning', title: `${m.name} : échéance dans ${left} jour${left > 1 ? 's' : ''}`, body: 'Pensez à renouveler l’abonnement.', href: `${base}/facturation` });
      }
    }
  }
  if (quota && !quota.unlimited && quota.limit > 0 && quota.remaining <= Math.max(20, quota.limit * 0.1)) {
    out.push({
      key: 'sms',
      icon: '✉️',
      tone: quota.remaining <= 0 ? 'danger' : 'warning',
      title: quota.remaining <= 0 ? 'Crédit SMS épuisé' : `Crédit SMS bas : ${quota.remaining} restant${quota.remaining > 1 ? 's' : ''}`,
      body: 'Les identifiants ne pourront plus partir par SMS. Achetez des SMS.',
      href: `${base}/facturation`,
    });
  }
  if (missing && !missing.error) {
    const n = ((missing.data ?? []) as { missing_hours?: number }[]).reduce((s, r) => s + (r.missing_hours ?? 1), 0);
    if (n >= MISSING_CALLS_ALERT) {
      out.push({ key: 'calls', icon: '⚠️', tone: 'warning', title: `${n} heures de cours sans appel aujourd’hui`, body: 'Voir qui n’a pas fait l’appel, et pourquoi.', href: `${base}/attendance/non-faits` });
    }
  }
  if (closing && !closing.error) {
    for (const p of (closing.data ?? []) as { id: string; name: string; grades_stop_on: string }[]) {
      const { count } = await supabase
        .from('assessments')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', ctx.school.id)
        .eq('academic_period_id', p.id)
        .in('status', ['DRAFT', 'OPEN']);
      if ((count ?? 0) === 0) continue;
      const jour = new Date(`${p.grades_stop_on}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      out.push({ key: `grades-${p.id}`, icon: '⏳', tone: 'warning', title: `${p.name} : ${count} évaluation${(count ?? 0) > 1 ? 's' : ''} encore ouverte${(count ?? 0) > 1 ? 's' : ''}`, body: `L’arrêt des notes est ${jour}.`, href: `${base}/evaluations` });
    }
  }
  return out.sort((a, b) => Number(b.tone === 'danger') - Number(a.tone === 'danger'));
}
