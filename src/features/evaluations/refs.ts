import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/** Données de référence pour les listes déroulantes des formulaires d'évaluation. */

export type Ref = { id: string; name: string };

export async function listPeriods(ctx: TenantContext, yearId: string): Promise<Ref[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('academic_periods')
    .select('id, name, sequence')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('is_grading_period', true)
    .order('sequence');
  return (data ?? []).map((p) => ({ id: p.id, name: p.name }));
}

export async function listClasses(ctx: TenantContext, yearId: string): Promise<Ref[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, name, code')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE')
    .order('code');
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

export async function listSubjects(ctx: TenantContext): Promise<Ref[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('school_id', ctx.school.id)
    .eq('is_active', true)
    .order('name');
  return (data ?? []) as Ref[];
}

export async function listTeachers(ctx: TenantContext): Promise<Ref[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('teachers')
    .select('id, first_name, last_name')
    .eq('school_id', ctx.school.id)
    .is('deleted_at', null)
    .order('last_name');
  return ((data ?? []) as { id: string; first_name: string; last_name: string }[]).map((t) => ({
    id: t.id,
    name: `${t.last_name.toUpperCase()} ${t.first_name}`,
  }));
}
