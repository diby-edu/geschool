import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { Tables } from '@/types/database';

export type YearRow = Pick<
  Tables<'academic_years'>,
  'id' | 'name' | 'starts_on' | 'ends_on' | 'status' | 'is_current'
>;
export type PeriodRow = Pick<
  Tables<'academic_periods'>,
  'id' | 'name' | 'sequence' | 'kind' | 'starts_on' | 'ends_on' | 'is_grading_period' | 'status' | 'tracks'
>;

export async function listYears(ctx: TenantContext): Promise<YearRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('academic_years')
    .select('id, name, starts_on, ends_on, status, is_current')
    .eq('school_id', ctx.school.id)
    .order('starts_on', { ascending: false });
  if (error) throw error;
  return (data ?? []) as YearRow[];
}

export async function getYear(ctx: TenantContext, id: string): Promise<YearRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('academic_years')
    .select('id, name, starts_on, ends_on, status, is_current')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return (data as YearRow | null) ?? null;
}

export async function listPeriods(ctx: TenantContext, yearId: string): Promise<PeriodRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('academic_periods')
    .select('id, name, sequence, kind, starts_on, ends_on, is_grading_period, status, tracks')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('sequence');
  return (data ?? []) as PeriodRow[];
}

export type PeriodWindow = {
  id: string;
  grading_starts_on: string | null;
  grading_ends_on: string | null;
  grading_override: string | null;
};

/**
 * Fenetres de calcul des moyennes (migration 0056), lues a part : si la migration n'est
 * pas encore appliquee, la fiche de l'annee reste utilisable (sans la section calcul).
 */
export async function listGradingWindows(ctx: TenantContext, yearId: string): Promise<Map<string, PeriodWindow> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('academic_periods')
    .select('id, grading_starts_on, grading_ends_on, grading_override')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId);
  if (error) return null;
  return new Map(((data ?? []) as PeriodWindow[]).map((w) => [w.id, w]));
}

export type CalendarEventRow = Pick<Tables<'school_calendar_events'>, 'id' | 'kind' | 'name' | 'starts_on' | 'ends_on' | 'blocks_schedule' | 'tracks'>;

/** Congés, jours fériés et fermetures de l'année, dans l'ordre du calendrier. */
export async function listCalendarEvents(ctx: TenantContext, yearId: string): Promise<CalendarEventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('school_calendar_events')
    .select('id, kind, name, starts_on, ends_on, blocks_schedule, tracks')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('starts_on');
  if (error) throw error;
  return (data ?? []) as CalendarEventRow[];
}
