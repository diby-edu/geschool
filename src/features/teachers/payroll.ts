import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { readSettings, writeSettings } from '@/features/settings/school-settings';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { COURSE_HOUR_MINUTES } from '@/features/programme/hours';
import { readServiceDefaults } from './service-defaults';
import { computePay, weekStart, type Course, type PayKind, type PayResult } from './payroll-core';

/**
 * Heures faites et paie à l'heure des enseignants (migration 0116).
 * Vacataire : toutes ses heures faites au taux horaire. Permanent : les heures
 * au-delà de son quota hebdomadaire (le maximum de son service), au taux des
 * heures supplémentaires. Taux de l'école, ou propre à l'enseignant.
 */

export type PayrollRates = { vacationRate: number; overtimeRate: number };

export async function readPayrollRates(ctx: TenantContext): Promise<PayrollRates> {
  // Rangés avec le service des enseignants (espace « schedule ») : le quota
  // des permanents y est déjà.
  const raw = (await readSettings(ctx, 'schedule')).payrollRates;
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return { vacationRate: num(s.vacationRate), overtimeRate: num(s.overtimeRate) };
}

export async function writePayrollRates(ctx: TenantContext, rates: PayrollRates): Promise<void> {
  requireWritable(ctx, 'settings.update');
  await writeSettings(ctx, 'schedule', { payrollRates: rates });
  await audit(ctx, { action: 'payroll.rates', module: 'teachers', entityType: 'school', entityId: ctx.school.id, after: rates });
}

export type PayrollRow = {
  teacherId: string;
  name: string;
  kind: PayKind;
  /** Quota hebdomadaire (permanent), en heures. */
  quota: number | null;
  rate: number;
  /** Taux propre à l'enseignant (sinon celui de l'école). */
  ownRate: boolean;
  result: PayResult;
  /** Heures de cours du mois (faites ou non). */
  monthHours: number;
  /** Détail cours par cours : seulement pour l'enseignant demandé (`detailFor`). */
  courses: (Course & { className: string | null; subject: string })[];
};

/** Premier et dernier jour d'un mois « AAAA-MM ». */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * Paie du mois de chaque enseignant. Une seule lecture compacte (0159) : un total
 * par jour et par enseignant, qui suffit au calcul ; le détail cours par cours
 * n'est lu que pour `detailFor` (l'enseignant ouvert sur la page).
 */
export async function buildPayroll(ctx: TenantContext, month: string, detailFor?: string): Promise<PayrollRow[]> {
  const { from, to } = monthBounds(month);
  // Depuis le lundi de la première semaine : le quota d'une semaine à cheval
  // sur deux mois compte aussi les heures de la fin du mois précédent.
  const since = weekStart(from);
  const supabase = await createClient();
  const detail = detailFor && /^[0-9a-f-]{36}$/i.test(detailFor) ? detailFor : null;
  const [{ data: rows, error }, { data: teachers }, rates, defaults] = await Promise.all([
    supabase.rpc('teacher_payroll_courses' as never, { p_school: ctx.school.id, p_from: since, p_to: to, p_detail: detail } as never),
    supabase
      .from('teachers')
      .select('id, first_name, last_name, employment_type, weekly_minutes_max, hourly_rate')
      .eq('school_id', ctx.school.id)
      .is('deleted_at', null)
      .order('last_name'),
    readPayrollRates(ctx),
    readServiceDefaults(ctx),
  ]);
  if (error) throw error;

  const byTeacher = new Map<string, { days: Course[]; courses: PayrollRow['courses'] }>();
  for (const t of (rows ?? []) as {
    teacher_id: string;
    days: [string, number, number][];
    courses: [string, string, number, boolean, string | null, string | null][] | null;
  }[]) {
    // Un jour = deux « cours » : ses heures faites, puis ses heures sans appel.
    const days: Course[] = [];
    for (const [date, done, undone] of t.days) {
      if (done > 0) days.push({ date, startsAt: date, hours: done, done: true });
      if (undone > 0) days.push({ date, startsAt: date, hours: undone, done: false });
    }
    const courses = (t.courses ?? []).map(([date, startsAt, hours, done, className, subject]) => ({
      date,
      startsAt,
      hours,
      done,
      className,
      subject: subject ?? 'Cours',
    }));
    byTeacher.set(t.teacher_id, { days, courses });
  }

  return ((teachers ?? []) as {
    id: string;
    first_name: string;
    last_name: string;
    employment_type: string;
    weekly_minutes_max: number | null;
    hourly_rate: number | string | null;
  }[])
    .map((t) => {
      // Un enseignant est vacataire ou permanent : tout ce qui n'est pas « vacataire » est permanent.
      const kind: PayKind = t.employment_type === 'HOURLY' ? 'HOURLY' : 'PERMANENT';
      const quota =
        kind === 'PERMANENT'
          ? t.weekly_minutes_max
            ? t.weekly_minutes_max / COURSE_HOUR_MINUTES
            : defaults.PERMANENT.max
          : null;
      const ownRate = t.hourly_rate !== null && t.hourly_rate !== '';
      const rate = ownRate ? Number(t.hourly_rate) : kind === 'HOURLY' ? rates.vacationRate : rates.overtimeRate;
      const own = byTeacher.get(t.id);
      const days = own?.days ?? [];
      return {
        teacherId: t.id,
        name: `${t.last_name.toUpperCase()} ${t.first_name}`,
        kind,
        quota,
        rate,
        ownRate,
        result: computePay(days, kind, quota, rate, from, to),
        monthHours: days.filter((c) => c.date >= from && c.date <= to).reduce((n, c) => n + c.hours, 0),
        courses: (own?.courses ?? []).filter((c) => c.date >= from && c.date <= to),
      };
    })
    .filter((r) => r.monthHours > 0);
}
