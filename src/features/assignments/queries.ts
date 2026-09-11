import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type AssignmentRow = {
  id: string;
  teacher: string;
  subject: string;
  klass: string;
  weekly_minutes: number;
};

export async function listAssignments(ctx: TenantContext, yearId: string): Promise<AssignmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('teaching_assignments')
    .select('id, weekly_minutes, teachers(first_name, last_name), subjects(name), classes(name)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE');
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string;
    weekly_minutes: number;
    teachers: { first_name: string; last_name: string } | null;
    subjects: { name: string } | null;
    classes: { name: string } | null;
  }[])
    .map((r) => ({
      id: r.id,
      teacher: r.teachers ? `${r.teachers.last_name.toUpperCase()} ${r.teachers.first_name}` : '—',
      subject: r.subjects?.name ?? '—',
      klass: r.classes?.name ?? '—',
      weekly_minutes: r.weekly_minutes,
    }))
    .sort((a, b) => a.klass.localeCompare(b.klass) || a.subject.localeCompare(b.subject));
}

/** Classes de l'annee, pour le selecteur d'affectation. */
export async function listYearClasses(ctx: TenantContext, yearId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, name')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE')
    .order('code');
  return (data ?? []) as { id: string; name: string }[];
}

export async function listActiveSubjects(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('school_id', ctx.school.id)
    .eq('is_active', true)
    .order('name');
  return (data ?? []) as { id: string; name: string }[];
}
