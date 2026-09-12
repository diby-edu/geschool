import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type AbsenceRow = {
  id: string;
  date: string;
  student: string;
  matricule: string;
  klass: string;
  subject: string;
  status: string;
  minutes_late: number;
  comment: string | null;
};

/**
 * Absences et retards sur une fenêtre de dates, éventuellement pour une classe.
 * La date de référence est celle de l'occurrence (le cours), pas la saisie.
 */
export async function listAbsences(
  ctx: TenantContext,
  opts: { from: string; to: string; classId?: string },
): Promise<AbsenceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('attendance_records')
    .select(
      'id, status, minutes_late, comment, ' +
        'students(matricule, first_name, last_name), ' +
        'attendance_registers(session_occurrences(occurs_on, ' +
        'schedule_sessions(subjects(name), schedule_session_targets(class_id, classes(name)))))',
    )
    .eq('school_id', ctx.school.id)
    .in('status', ['ABSENT', 'LATE'])
    .order('recorded_at', { ascending: false });

  const rows = ((data ?? []) as unknown as {
    id: string;
    status: string;
    minutes_late: number;
    comment: string | null;
    students: { matricule: string; first_name: string; last_name: string } | null;
    attendance_registers: {
      session_occurrences: {
        occurs_on: string;
        schedule_sessions: {
          subjects: { name: string } | null;
          schedule_session_targets: { class_id: string | null; classes: { name: string } | null }[];
        } | null;
      } | null;
    } | null;
  }[])
    .map((r) => {
      const occ = r.attendance_registers?.session_occurrences ?? null;
      const target = occ?.schedule_sessions?.schedule_session_targets?.[0] ?? null;
      return {
        id: r.id,
        date: occ?.occurs_on ?? '',
        student: r.students ? `${r.students.last_name.toUpperCase()} ${r.students.first_name}` : '—',
        matricule: r.students?.matricule ?? '',
        klass: target?.classes?.name ?? '—',
        classId: target?.class_id ?? null,
        subject: occ?.schedule_sessions?.subjects?.name ?? 'Cours',
        status: r.status,
        minutes_late: r.minutes_late,
        comment: r.comment,
      };
    })
    .filter((r) => r.date >= opts.from && r.date <= opts.to && (!opts.classId || r.classId === opts.classId))
    .sort((a, b) => b.date.localeCompare(a.date) || a.student.localeCompare(b.student));

  return rows.map(({ classId: _classId, ...rest }) => rest);
}
