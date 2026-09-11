import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type ClassRow = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  level_name: string | null;
  head_teacher: string | null;
  enrolled: number;
};

export async function listClasses(ctx: TenantContext, yearId: string): Promise<ClassRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('classes')
    .select('id, code, name, capacity, levels(name), teachers(first_name, last_name), student_enrollments(count)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE')
    .order('code');
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string;
    code: string;
    name: string;
    capacity: number;
    levels: { name: string } | null;
    teachers: { first_name: string; last_name: string } | null;
    student_enrollments: { count: number }[];
  }[]).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    capacity: c.capacity,
    level_name: c.levels?.name ?? null,
    head_teacher: c.teachers ? `${c.teachers.first_name} ${c.teachers.last_name}` : null,
    enrolled: c.student_enrollments?.[0]?.count ?? 0,
  }));
}

export async function getClass(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, code, name, capacity, level_id, head_teacher_id, academic_year_id')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return data;
}
