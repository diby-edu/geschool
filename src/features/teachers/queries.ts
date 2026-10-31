import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { EMPLOYMENT_OPTIONS, type EmploymentCode } from '@/lib/hr';
import { loadTeacherContacts } from './contacts';
import { fetchAllRows } from '@/lib/supabase/pagination';

export type ContractCode = EmploymentCode;
export const CONTRACT_FILTERS = EMPLOYMENT_OPTIONS.map((o) => o.code) as readonly ContractCode[];

/** Un enseignant avec ce qu'il enseigne vraiment cette année (maquette validée le 2026-10-30). */
export type TeacherOverview = {
  id: string;
  staff_number: string;
  first_name: string;
  last_name: string;
  employment_type: string;
  status: string;
  user_id: string | null;
  phone_e164: string | null;
  /** Matières de ses affectations de l'année (et non la « spécialité », rarement remplie). */
  subjects: { id: string; name: string }[];
  /** Ses classes, dans l'ordre de l'école. */
  classes: { id: string; name: string; levelId: string | null }[];
  /** Service de la semaine : somme des volumes de ses affectations, en minutes. */
  weekly_minutes: number;
};

/**
 * Tous les enseignants, avec leurs matières et leurs classes de l'année, en deux
 * lectures parallèles. Un établissement en compte quelques centaines au plus :
 * filtres et tri se font ensuite sans retourner à la base.
 */
export async function listTeachersOverview(ctx: TenantContext, yearId: string | null): Promise<TeacherOverview[]> {
  const supabase = await createClient();
  const [{ data: teachers, error }, { data: assignments }] = await Promise.all([
    supabase
      .from('teachers')
      .select('id, staff_number, first_name, last_name, employment_type, status, user_id')
      .eq('school_id', ctx.school.id)
      .is('deleted_at', null)
      .limit(5000),
    // Par paquets de 1 000 : au-delà, la base tronque la réponse sans rien dire.
    yearId
      ? fetchAllRows<{ id: string }>((cursor) => {
          let q = supabase
            .from('teaching_assignments')
            .select('id, teacher_id, weekly_minutes, subject_id, subjects(name), class_id, classes(name, level_id, levels(sequence))')
            .eq('school_id', ctx.school.id)
            .eq('academic_year_id', yearId)
            .eq('status', 'ACTIVE')
            .order('id')
            .limit(1000);
          if (cursor) q = q.gt('id', cursor);
          return q as unknown as PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;
        }, 1000).then((data) => ({ data }))
      : Promise.resolve({ data: [] }),
  ]);
  if (error) throw error;

  type A = {
    teacher_id: string;
    weekly_minutes: number;
    subject_id: string;
    subjects: { name: string } | null;
    class_id: string | null;
    classes: { name: string; level_id: string | null; levels: { sequence: number } | null } | null;
  };
  const byTeacher = new Map<string, { subjects: Map<string, string>; classes: Map<string, { name: string; levelId: string | null; seq: number }>; minutes: number }>();
  for (const a of (assignments ?? []) as unknown as A[]) {
    const t = byTeacher.get(a.teacher_id) ?? { subjects: new Map(), classes: new Map(), minutes: 0 };
    t.subjects.set(a.subject_id, a.subjects?.name ?? '—');
    if (a.class_id && a.classes) t.classes.set(a.class_id, { name: a.classes.name, levelId: a.classes.level_id, seq: a.classes.levels?.sequence ?? 999 });
    t.minutes += a.weekly_minutes;
    byTeacher.set(a.teacher_id, t);
  }
  const rows = teachers ?? [];
  const contacts = await loadTeacherContacts(ctx, rows.map((t) => t.id));
  return rows.map((t) => {
    const own = byTeacher.get(t.id);
    return {
      ...t,
      phone_e164: contacts.get(t.id)?.phone_e164 ?? null,
      subjects: [...(own?.subjects ?? [])].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      classes: [...(own?.classes ?? [])]
        .sort((a, b) => a[1].seq - b[1].seq || a[1].name.localeCompare(b[1].name, 'fr', { numeric: true }))
        .map(([id, c]) => ({ id, name: c.name, levelId: c.levelId })),
      weekly_minutes: own?.minutes ?? 0,
    };
  });
}

export async function getTeacher(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('teachers')
    .select(
      'id, staff_number, first_name, last_name, gender, specialty, employment_type, status, hire_date, diploma, diploma_detail, weekly_minutes_min, weekly_minutes_max, hourly_rate, user_id',
    )
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;
  const c = (await loadTeacherContacts(ctx, [data.id])).get(data.id);
  return {
    ...data,
    birth_date: c?.birth_date ?? null,
    phone_e164: c?.phone_e164 ?? null,
    email: c?.email ?? null,
    address: c?.address ?? null,
  };
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
