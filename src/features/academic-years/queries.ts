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
  'id' | 'name' | 'sequence' | 'kind' | 'starts_on' | 'ends_on' | 'is_grading_period' | 'status'
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
    .select('id, name, sequence, kind, starts_on, ends_on, is_grading_period, status')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('sequence');
  return (data ?? []) as PeriodRow[];
}
