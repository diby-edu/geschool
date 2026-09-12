import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { ListParams } from '@/lib/query/list';

export type StudentRow = {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  class_name: string | null;
};

export const STUDENT_SORTABLE = ['matricule', 'last_name'] as const;

export async function listStudents(
  ctx: TenantContext,
  yearId: string,
  params: ListParams,
): Promise<{ rows: StudentRow[]; total: number }> {
  const supabase = await createClient();
  // On liste les eleves inscrits pour l'annee via student_enrollments
  let query = supabase
    .from('student_enrollments')
    .select('students!inner(id, matricule, first_name, last_name, deleted_at), classes(name)', { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ENROLLED');

  if (params.q) {
    query = query.or(
      `last_name.ilike.%${params.q}%,first_name.ilike.%${params.q}%,matricule.ilike.%${params.q}%`,
      { referencedTable: 'students' },
    );
  }

  query = query.range(params.from, params.to);
  const { data, count, error } = await query;
  if (error) throw error;

  const rows: StudentRow[] = ((data ?? []) as unknown as {
    students: { id: string; matricule: string; first_name: string; last_name: string; deleted_at: string | null };
    classes: { name: string } | null;
  }[])
    .filter((r) => r.students && !r.students.deleted_at)
    .map((r) => ({
      id: r.students.id,
      matricule: r.students.matricule,
      first_name: r.students.first_name,
      last_name: r.students.last_name,
      class_name: r.classes?.name ?? null,
    }))
    .sort((a, b) => a.last_name.localeCompare(b.last_name));

  return { rows, total: count ?? 0 };
}

export async function getStudentDetail(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data: student } = await supabase
    .from('students')
    .select('id, matricule, first_name, last_name, gender, birth_date, status')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  if (!student) return null;

  const { data: guardians } = await supabase
    .from('student_guardians')
    .select('relationship, is_primary_contact, guardians(id, first_name, last_name, phone_display, phone_e164)')
    .eq('school_id', ctx.school.id)
    .eq('student_id', id);

  return {
    student,
    guardians: ((guardians ?? []) as unknown as {
      relationship: string;
      is_primary_contact: boolean;
      guardians: { id: string; first_name: string; last_name: string; phone_display: string | null; phone_e164: string } | null;
    }[])
      .filter((g) => g.guardians)
      .map((g) => ({
        relationship: g.relationship,
        isPrimary: g.is_primary_contact,
        id: g.guardians!.id,
        name: `${g.guardians!.first_name} ${g.guardians!.last_name}`,
        phone: g.guardians!.phone_display ?? g.guardians!.phone_e164,
      })),
  };
}
