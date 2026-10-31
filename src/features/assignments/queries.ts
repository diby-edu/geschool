import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { fetchAllRows } from '@/lib/supabase/pagination';

export type AssignmentRow = {
  id: string;
  teacher: string;
  subject: string;
  klass: string;
  weekly_minutes: number;
  /** Pour les filtres et le tri de la vue liste. */
  teacher_id: string;
  /** Matricule : distingue deux homonymes dans le filtre. */
  teacher_number: string;
  subject_id: string;
  class_id: string | null;
  level_id: string | null;
  level_seq: number;
};

export async function listAssignments(ctx: TenantContext, yearId: string): Promise<AssignmentRow[]> {
  const supabase = await createClient();
  // Par paquets de 1 000 : une lecture d'un bloc était tronquée sans rien dire
  // au-delà (un grand lycée dépasse le millier d'affectations).
  const data = await fetchAllRows<{ id: string }>((cursor) => {
    let q = supabase
      .from('teaching_assignments')
      .select('id, weekly_minutes, teacher_id, subject_id, class_id, teachers(first_name, last_name, staff_number), subjects(name), classes(name, level_id, levels(sequence))')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('status', 'ACTIVE')
      .order('id')
      .limit(1000);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;
  }, 1000);

  return (data as unknown as {
    id: string;
    weekly_minutes: number;
    teacher_id: string;
    subject_id: string;
    class_id: string | null;
    teachers: { first_name: string; last_name: string; staff_number: string | null } | null;
    subjects: { name: string } | null;
    classes: { name: string; level_id: string | null; levels: { sequence: number } | null } | null;
  }[])
    .map((r) => ({
      id: r.id,
      teacher: r.teachers ? `${r.teachers.last_name.toUpperCase()} ${r.teachers.first_name}` : '—',
      subject: r.subjects?.name ?? '—',
      klass: r.classes?.name ?? '—',
      weekly_minutes: r.weekly_minutes,
      teacher_id: r.teacher_id,
      teacher_number: r.teachers?.staff_number ?? '',
      subject_id: r.subject_id,
      class_id: r.class_id,
      level_id: r.classes?.level_id ?? null,
      level_seq: r.classes?.levels?.sequence ?? 999,
    }))
    // Par niveau puis par classe (« 6ème 2 » avant « 6ème 10 »), puis matière.
    .sort((a, b) => a.level_seq - b.level_seq || a.klass.localeCompare(b.klass, 'fr', { numeric: true }) || a.subject.localeCompare(b.subject, 'fr'));
}

/** Classes de l'annee, pour le selecteur d'affectation. */
export async function listYearClasses(ctx: TenantContext, yearId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, name')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE');
  // Tri naturel : « 3ème 2 » avant « 3ème 10 » (la base trie « 10 » avant « 2 »).
  return ((data ?? []) as { id: string; name: string }[]).sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { numeric: true }),
  );
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
