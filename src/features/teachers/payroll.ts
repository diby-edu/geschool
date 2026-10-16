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
  courses: (Course & { className: string | null; subject: string })[];
};

/** Premier et dernier jour d'un mois « AAAA-MM ». */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export async function buildPayroll(ctx: TenantContext, month: string): Promise<PayrollRow[]> {
  const { from, to } = monthBounds(month);
  // Depuis le lundi de la première semaine : le quota d'une semaine à cheval
  // sur deux mois compte aussi les heures de la fin du mois précédent.
  const since = weekStart(from);
  const supabase = await createClient();
  const [{ data: rows, error }, { data: teachers }, rates, defaults] = await Promise.all([
    // Une ligne par enseignant (0129) : par cours, la réponse était coupée à
    // 1 000 lignes par PostgREST et la paie d'un grand établissement était fausse.
    supabase.rpc('teacher_course_hours_by_teacher' as never, { p_school: ctx.school.id, p_from: since, p_to: to } as never),
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

  const byTeacher = new Map<string, PayrollRow['courses']>();
  for (const t of (rows ?? []) as {
    teacher_id: string;
    courses: { occurs_on: string; starts_at: string; hours: number; done: boolean; class_name: string | null; subject: string }[];
  }[]) {
    byTeacher.set(
      t.teacher_id,
      t.courses.map((r) => ({ date: r.occurs_on, startsAt: r.starts_at, hours: r.hours, done: r.done, className: r.class_name, subject: r.subject })),
    );
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
      const courses = (byTeacher.get(t.id) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return {
        teacherId: t.id,
        name: `${t.last_name.toUpperCase()} ${t.first_name}`,
        kind,
        quota,
        rate,
        ownRate,
        result: computePay(courses, kind, quota, rate, from, to),
        courses: courses.filter((c) => c.date >= from && c.date <= to),
      };
    })
    .filter((r) => r.courses.length > 0);
}
