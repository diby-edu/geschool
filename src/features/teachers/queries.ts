import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { ListParams } from '@/lib/query/list';
import type { Tables } from '@/types/database';

export type TeacherRow = Pick<
  Tables<'teachers'>,
  'id' | 'staff_number' | 'first_name' | 'last_name' | 'specialty' | 'status'
>;

export const TEACHER_SORTABLE = ['staff_number', 'last_name'] as const;

export async function listTeachers(
  ctx: TenantContext,
  params: ListParams,
): Promise<{ rows: TeacherRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from('teachers')
    .select('id, staff_number, first_name, last_name, specialty, status', { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .is('deleted_at', null);

  if (params.q) {
    query = query.or(
      `last_name.ilike.%${params.q}%,first_name.ilike.%${params.q}%,staff_number.ilike.%${params.q}%`,
    );
  }

  const sort = params.sort && (TEACHER_SORTABLE as readonly string[]).includes(params.sort)
    ? params.sort
    : 'last_name';
  query = query.order(sort, { ascending: params.dir === 'asc' }).range(params.from, params.to);

  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as TeacherRow[], total: count ?? 0 };
}

export async function getTeacher(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('teachers')
    .select('id, staff_number, first_name, last_name, gender, phone_e164, email, specialty, employment_type, status')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  return data;
}

/** Enseignants actifs, pour un selecteur (professeur principal, affectations). */
export async function listActiveTeachers(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('teachers')
    .select('id, first_name, last_name')
    .eq('school_id', ctx.school.id)
    .eq('status', 'ACTIVE')
    .is('deleted_at', null)
    .order('last_name');
  return (data ?? []).map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name}` }));
}
