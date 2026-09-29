import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Lectures du module discipline.
 *
 * Ce que chacun voit est décidé par la base (RLS 0071) : la direction voit
 * tout, un enseignant voit les incidents de ses élèves et ceux qu'il a
 * signalés. L'application ne refait pas ce tri.
 */

export type DisciplineTypeRow = { id: string; code: string; name: string; points: number; isActive: boolean };
export type SanctionTypeRow = { id: string; code: string; name: string; needsDates: boolean; isActive: boolean };

export type IncidentRow = {
  id: string;
  occurredOn: string;
  occurredAt: string | null;
  description: string;
  status: string;
  typeName: string;
  points: number;
  studentId: string;
  studentName: string;
  matricule: string;
  className: string;
  sanctions: { id: string; name: string; status: string; startsOn: string | null; endsOn: string | null }[];
};

export async function listIncidentTypes(ctx: TenantContext): Promise<DisciplineTypeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('discipline_incident_types')
    .select('id, code, name, points, is_active')
    .eq('school_id', ctx.school.id)
    .order('name');
  return ((data ?? []) as { id: string; code: string; name: string; points: number; is_active: boolean }[]).map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    points: t.points,
    isActive: t.is_active,
  }));
}

export async function listSanctionTypes(ctx: TenantContext): Promise<SanctionTypeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('discipline_sanction_types')
    .select('id, code, name, needs_dates, is_active')
    .eq('school_id', ctx.school.id)
    .order('name');
  return ((data ?? []) as { id: string; code: string; name: string; needs_dates: boolean; is_active: boolean }[]).map(
    (t) => ({ id: t.id, code: t.code, name: t.name, needsDates: t.needs_dates, isActive: t.is_active }),
  );
}

type RawIncident = {
  id: string;
  occurred_on: string;
  occurred_at: string | null;
  description: string;
  status: string;
  student_id: string;
  discipline_incident_types: { name: string; points: number } | null;
  students: { matricule: string; first_name: string; last_name: string } | null;
  classes: { name: string } | null;
  discipline_sanctions: {
    id: string;
    status: string;
    starts_on: string | null;
    ends_on: string | null;
    discipline_sanction_types: { name: string } | null;
  }[];
};

/** Incidents de l'année, du plus récent au plus ancien. */
export async function listIncidents(
  ctx: TenantContext,
  filters: { studentId?: string; classId?: string; status?: 'OPEN' | 'CLOSED' } = {},
): Promise<IncidentRow[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();

  let q = supabase
    .from('discipline_incidents')
    .select(
      'id, occurred_on, occurred_at, description, status, student_id, ' +
        'discipline_incident_types(name, points), students(matricule, first_name, last_name), classes(name), ' +
        'discipline_sanctions(id, status, starts_on, ends_on, discipline_sanction_types(name))',
    )
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('occurred_on', { ascending: false })
    .limit(300);
  if (filters.studentId) q = q.eq('student_id', filters.studentId);
  if (filters.classId) q = q.eq('class_id', filters.classId);
  if (filters.status) q = q.eq('status', filters.status);

  const { data } = await q;
  return ((data ?? []) as unknown as RawIncident[]).map((i) => ({
    id: i.id,
    occurredOn: i.occurred_on,
    occurredAt: i.occurred_at ? i.occurred_at.slice(0, 5) : null,
    description: i.description,
    status: i.status,
    typeName: i.discipline_incident_types?.name ?? '—',
    points: i.discipline_incident_types?.points ?? 0,
    studentId: i.student_id,
    studentName: i.students ? `${i.students.last_name.toUpperCase()} ${i.students.first_name}` : '—',
    matricule: i.students?.matricule ?? '—',
    className: i.classes?.name ?? '—',
    sanctions: (i.discipline_sanctions ?? []).map((s) => ({
      id: s.id,
      name: s.discipline_sanction_types?.name ?? '—',
      status: s.status,
      startsOn: s.starts_on,
      endsOn: s.ends_on,
    })),
  }));
}

export async function getIncident(ctx: TenantContext, id: string): Promise<IncidentRow | null> {
  const list = await listIncidents(ctx);
  return list.find((i) => i.id === id) ?? null;
}

/** Compte des incidents par élève : le suivi qui intéresse la vie scolaire. */
export async function incidentTally(
  ctx: TenantContext,
): Promise<{ studentId: string; studentName: string; className: string; count: number; points: number }[]> {
  const rows = await listIncidents(ctx);
  const byStudent = new Map<string, { studentId: string; studentName: string; className: string; count: number; points: number }>();
  for (const r of rows) {
    const entry = byStudent.get(r.studentId) ?? {
      studentId: r.studentId,
      studentName: r.studentName,
      className: r.className,
      count: 0,
      points: 0,
    };
    entry.count += 1;
    entry.points += r.points;
    byStudent.set(r.studentId, entry);
  }
  return [...byStudent.values()].sort((a, b) => b.points - a.points || b.count - a.count);
}

/**
 * Élèves que l'on peut viser dans un signalement. La RLS ne renvoie que ceux
 * que la personne a le droit de voir : un enseignant obtient ses classes, la
 * vie scolaire obtient tout l'établissement.
 */
export async function listStudentOptions(ctx: TenantContext): Promise<{ id: string; name: string; className: string }[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('student_enrollments')
    .select('students!inner(id, first_name, last_name, deleted_at), classes(name)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ENROLLED')
    .order('last_name', { referencedTable: 'students' })
    .limit(2000);

  return ((data ?? []) as unknown as {
    students: { id: string; first_name: string; last_name: string; deleted_at: string | null };
    classes: { name: string } | null;
  }[])
    .filter((r) => r.students && !r.students.deleted_at)
    .map((r) => ({
      id: r.students.id,
      name: `${r.students.last_name.toUpperCase()} ${r.students.first_name}`,
      className: r.classes?.name ?? '—',
    }));
}
