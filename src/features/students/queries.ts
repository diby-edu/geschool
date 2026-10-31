import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { ListParams } from '@/lib/query/list';
import { formatPhoneForDisplay } from '@/lib/auth/identifier';

export type StudentRow = {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  class_name: string | null;
  /** Affecté par l'État, non affecté, ou non renseigné (fiches antérieures). */
  is_state_assigned: boolean | null;
  is_repeating: boolean;
};

export const STUDENT_SORTABLE = ['matricule', 'last_name'] as const;

export type StudentFilters = {
  /** 'affecte' | 'non-affecte' — le statut d'affectation par l'État. */
  assigned?: 'affecte' | 'non-affecte';
  classId?: string;
};

export async function listStudents(
  ctx: TenantContext,
  yearId: string,
  params: ListParams,
  filters: StudentFilters = {},
): Promise<{ rows: StudentRow[]; total: number }> {
  const supabase = await createClient();
  // On liste les eleves inscrits pour l'annee via student_enrollments
  let query = supabase
    .from('student_enrollments')
    .select('is_repeating, students!inner(id, matricule, first_name, last_name, deleted_at, is_state_assigned), classes(name)', {
      count: 'exact',
    })
    .eq('school_id', ctx.school.id)
    // Filtre redit sur la fiche élève : sans lui, la base parcourt les élèves de
    // TOUTES les écoles et évalue le droit de lecture ligne par ligne (12 s pour
    // 5 600 élèves, au-delà du délai). Avec lui : l'index de l'école, 0,3 s.
    .eq('students.school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ENROLLED');

  if (filters.classId) query = query.eq('class_id', filters.classId);
  // Le filtre porte sur la fiche élève, pas sur l'inscription : le statut suit
  // l'élève d'une année sur l'autre.
  if (filters.assigned) {
    query = query.eq('students.is_state_assigned', filters.assigned === 'affecte');
  }

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
    is_repeating: boolean;
    students: {
      id: string;
      matricule: string;
      first_name: string;
      last_name: string;
      deleted_at: string | null;
      is_state_assigned: boolean | null;
    };
    classes: { name: string } | null;
  }[])
    .filter((r) => r.students && !r.students.deleted_at)
    .map((r) => ({
      id: r.students.id,
      matricule: r.students.matricule,
      first_name: r.students.first_name,
      last_name: r.students.last_name,
      class_name: r.classes?.name ?? null,
      is_state_assigned: r.students.is_state_assigned,
      is_repeating: r.is_repeating,
    }))
    .sort((a, b) => a.last_name.localeCompare(b.last_name));

  return { rows, total: count ?? 0 };
}

/** Une ligne de la liste des élèves (0161, maquette validée le 2026-10-30). */
export type StudentListRow = {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  gender: 'M' | 'F' | 'OTHER' | null;
  is_state_assigned: boolean | null;
  is_repeating: boolean;
  /** Aucune inscription dans l'école une année précédente. */
  is_new: boolean;
  class_id: string | null;
  class_name: string | null;
  level_name: string | null;
  level_seq: number;
  /** Téléphone du parent à contacter, prêt à afficher ; null s'il n'y en a aucun. */
  guardian_phone: string | null;
};

export type StudentListQuery = {
  level?: string | undefined;
  classId?: string | undefined;
  assigned?: 'affecte' | 'non-affecte' | 'inconnu' | undefined;
  situation?: 'redoublant' | 'nouveau' | undefined;
  q?: string | undefined;
  sort: 'classe' | 'nom' | 'matricule';
  desc: boolean;
  page: number;
  pageSize: number;
};

/**
 * Liste des élèves inscrits : filtrée, triée (par classe : niveau puis classe)
 * et découpée en pages par la base, en une lecture (students_page, 0161).
 * Avant la migration : `null`, la page reprend l'ancienne liste.
 */
export async function listStudentsPage(
  ctx: TenantContext,
  yearId: string,
  q: StudentListQuery,
): Promise<{ rows: StudentListRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('students_page' as never, {
    p_school: ctx.school.id,
    p_year: yearId,
    p_level: q.level || null,
    p_class: q.classId || null,
    p_assigned: q.assigned ?? null,
    p_situation: q.situation ?? null,
    p_q: q.q || null,
    p_sort: q.sort,
    p_desc: q.desc,
    p_limit: q.pageSize,
    p_offset: (q.page - 1) * q.pageSize,
  } as never);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw error;
  }
  const res = data as unknown as { total: number; rows: StudentListRow[] };
  return {
    total: res.total,
    rows: res.rows.map((r) => ({
      ...r,
      guardian_phone: r.guardian_phone ? formatPhoneForDisplay(r.guardian_phone, ctx.school.countryCode) : null,
    })),
  };
}

/** Niveaux et classes de l'année, dans l'ordre de l'école, pour les filtres. */
export async function listClassFilterOptions(
  ctx: TenantContext,
  yearId: string,
): Promise<{ levels: { id: string; name: string }[]; classes: { id: string; name: string; levelId: string }[] }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('id, name, level_id, levels(name, sequence)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE');
  const rows = ((data ?? []) as unknown as { id: string; name: string; level_id: string | null; levels: { name: string; sequence: number } | null }[]).sort(
    (a, b) => (a.levels?.sequence ?? 999) - (b.levels?.sequence ?? 999) || a.name.localeCompare(b.name, 'fr', { numeric: true }),
  );
  const levels = new Map<string, string>();
  for (const r of rows) if (r.level_id && r.levels) levels.set(r.level_id, r.levels.name);
  return {
    levels: [...levels].map(([id, name]) => ({ id, name })),
    classes: rows.map((r) => ({ id: r.id, name: r.name, levelId: r.level_id ?? '' })),
  };
}

export async function getStudentDetail(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data: student } = await supabase
    .from('students')
    .select('id, matricule, first_name, last_name, gender, birth_date, birth_place, status, is_state_assigned')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  if (!student) return null;

  // La scolarité de l'année en cours : sa classe, et s'il redouble. La fiche ne
  // la montrait pas du tout — on ne pouvait pas savoir dans quelle classe était
  // un élève depuis sa propre fiche.
  const { data: enrollment } = ctx.academicYear
    ? await supabase
        .from('student_enrollments')
        .select('class_id, is_repeating, status, enrolled_on, left_on, left_reason, classes(name)')
        .eq('school_id', ctx.school.id)
        .eq('student_id', id)
        .eq('academic_year_id', ctx.academicYear.id)
        .maybeSingle()
    : { data: null };

  const { data: guardians } = await supabase
    .from('student_guardians')
    .select('relationship, is_primary_contact, guardians(id, first_name, last_name, phone_display, phone_e164)')
    .eq('school_id', ctx.school.id)
    .eq('student_id', id);

  const enr = enrollment as unknown as {
    class_id: string | null;
    is_repeating: boolean;
    status: string;
    enrolled_on: string | null;
    left_on: string | null;
    left_reason: string | null;
    classes: { name: string } | null;
  } | null;

  return {
    student,
    enrollment: enr
      ? {
          classId: enr.class_id,
          className: enr.classes?.name ?? null,
          isRepeating: enr.is_repeating,
          status: enr.status,
          enrolledOn: enr.enrolled_on,
          leftOn: enr.left_on,
          leftReason: enr.left_reason,
        }
      : null,
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

/** Le dossier d'un élève et ses responsables, champ par champ, pour la page de correction. */
export async function loadStudentForEdit(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const [{ data: student }, { data: links }] = await Promise.all([
    supabase
      .from('students')
      .select('id, matricule, first_name, last_name, gender, birth_date, birth_place, is_state_assigned')
      .eq('school_id', ctx.school.id)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('student_guardians')
      .select('relationship, is_primary_contact, guardians(id, first_name, last_name, phone_e164)')
      .eq('school_id', ctx.school.id)
      .eq('student_id', id),
  ]);
  if (!student) return null;
  const guardians = ((links ?? []) as unknown as {
    relationship: string;
    is_primary_contact: boolean;
    guardians: { id: string; first_name: string; last_name: string; phone_e164: string } | null;
  }[])
    .filter((l) => l.guardians)
    .map((l) => ({
      id: l.guardians!.id,
      firstName: l.guardians!.first_name,
      lastName: l.guardians!.last_name,
      phone: formatPhoneForDisplay(l.guardians!.phone_e164, ctx.school.countryCode),
      relationship: l.relationship,
      isPrimary: l.is_primary_contact,
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  return { student, guardians };
}
