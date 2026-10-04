import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { getYear } from '@/features/academic-years/queries';
import { debutFenetre, isJustified, summarize, type AttendanceSummary, type Cover, type Fenetre } from './attendance-rules';
import type { Child } from './children';

/**
 * Les absences et les retards d'un enfant, pour ses parents.
 *
 * La RLS fait tout le tri : `attendance_records` n'est lisible que par
 * `app.can_see_student` (0020), donc un parent ne voit que ses enfants, et
 * `absence_justifications` suit la meme regle. Rien a filtrer de plus ici que
 * la fenetre de consultation.
 *
 * La date de reference est celle du COURS (session_occurrences.occurs_on), pas
 * celle de la saisie : un appel rattrape le lendemain ne doit pas deplacer
 * l'absence d'un jour sous les yeux du parent.
 */

export type AbsenceLine = {
  id: string;
  date: string;
  subject: string;
  status: string;
  minutesLate: number;
  comment: string | null;
  justified: boolean;
};

export type ChildAttendance = {
  lines: AbsenceLine[];
  totals: AttendanceSummary;
  /** Justificatifs deposes qui recouvrent la fenetre, decision comprise. */
  justifications: { id: string; from: string; to: string; reason: string; status: string }[];
  since: string;
};

export async function loadChildAttendance(
  ctx: TenantContext,
  child: Child,
  fenetre: Fenetre,
): Promise<ChildAttendance> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // « Toute l'année » s'arrête a la rentree : le contexte ne porte pas les dates
  // de l'annee, on les demande seulement quand la fenetre en a besoin.
  const yearId = ctx.academicYear?.id ?? null;
  const year = fenetre === 'annee' && yearId ? await getYear(ctx, yearId) : null;
  const since = debutFenetre(fenetre, today, year?.starts_on ?? null);

  const [{ data: records }, { data: justifs }] = await Promise.all([
    supabase
      .from('attendance_records')
      .select(
        'id, status, minutes_late, comment, recorded_at, ' +
          'attendance_registers(session_occurrences(occurs_on, schedule_sessions(subjects(name))))',
      )
      .eq('school_id', ctx.school.id)
      .eq('student_id', child.id)
      .in('status', ['ABSENT', 'LATE', 'EXCUSED'])
      .order('recorded_at', { ascending: false })
      .limit(500),
    supabase
      .from('absence_justifications')
      .select('id, covers_from, covers_to, reason, status')
      .eq('school_id', ctx.school.id)
      .eq('student_id', child.id)
      .gte('covers_to', since)
      .order('covers_from', { ascending: false }),
  ]);

  const covers: Cover[] = ((justifs ?? []) as { covers_from: string; covers_to: string; status: string }[]).map((j) => ({
    from: j.covers_from,
    to: j.covers_to,
    status: j.status,
  }));

  const lines = ((records ?? []) as unknown as {
    id: string;
    status: string;
    minutes_late: number;
    comment: string | null;
    recorded_at: string;
    attendance_registers: {
      session_occurrences: { occurs_on: string; schedule_sessions: { subjects: { name: string } | null } | null } | null;
    } | null;
  }[])
    .map((r) => {
      // Le cours n'est lisible par la famille que si l'emploi du temps est
      // PUBLIE (app.can_see_session). S'il ne l'est pas, l'absence existe quand
      // meme : on la montre au jour de sa saisie plutot que de la taire.
      const occ = r.attendance_registers?.session_occurrences ?? null;
      const date = occ?.occurs_on ?? r.recorded_at.slice(0, 10);
      return {
        id: r.id,
        date,
        subject: occ?.schedule_sessions?.subjects?.name ?? 'Cours',
        status: r.status,
        minutesLate: r.minutes_late,
        comment: r.comment,
        justified: isJustified(date, r.status, covers),
      };
    })
    .filter((r) => r.date >= since && r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    lines,
    totals: summarize(lines.map((l) => ({ date: l.date, status: l.status, minutesLate: l.minutesLate, justified: l.justified }))),
    justifications: ((justifs ?? []) as { id: string; covers_from: string; covers_to: string; reason: string; status: string }[]).map(
      (j) => ({ id: j.id, from: j.covers_from, to: j.covers_to, reason: j.reason, status: j.status }),
    ),
    since,
  };
}
