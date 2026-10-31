import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { getYear } from '@/features/academic-years/queries';
import { debutFenetre, isJustified, summarize, type AttendanceSummary, type Cover, type Fenetre } from './attendance-rules';
import type { Child } from './children';
import { courseHours } from '@/features/attendance/course-hours';

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
  /** Heures manquées (appel par heure, 0170) : 1 h par heure de cours absente. */
  hours: number;
  /** « 14 h – 16 h » : les heures manquées, dans le fuseau de l'école (0173). */
  span: string | null;
  /** Le professeur du cours (0173). */
  teacher: string | null;
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
        'id, status, minutes_late, comment, recorded_at, absent_hours, ' +
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
    absent_hours: number[] | null;
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
        hours: r.status === 'LATE' ? 0 : Math.max(1, r.absent_hours?.length ?? 0),
        span: null as string | null,
        teacher: null as string | null,
      };
    })
    .filter((r) => r.date >= since && r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));

  // L'heure et le professeur de chaque absence (0173) : un parent ne lit pas la
  // fiche des enseignants, la base lui donne seulement le nom.
  const { data: details } = await supabase.rpc('child_absence_details' as never, {
    p_school: ctx.school.id,
    p_student: child.id,
    p_from: since,
    p_to: today,
  } as never);
  const byRecord = new Map(
    ((details ?? []) as { record_id: string; starts_at: string; ends_at: string; course_hours: number; absent_hours: number[] | null; teacher: string | null }[]).map((d) => [d.record_id, d]),
  );
  for (const l of lines) {
    const d = byRecord.get(l.id);
    if (!d) continue;
    l.teacher = d.teacher;
    l.span = absentSpan(d.starts_at, d.ends_at, d.course_hours, d.absent_hours ?? [], ctx.school.timezone);
  }

  return {
    lines,
    totals: summarize(lines.map((l) => ({ date: l.date, status: l.status, minutesLate: l.minutesLate, justified: l.justified }))),
    justifications: ((justifs ?? []) as { id: string; covers_from: string; covers_to: string; reason: string; status: string }[]).map(
      (j) => ({ id: j.id, from: j.covers_from, to: j.covers_to, reason: j.reason, status: j.status }),
    ),
    since,
  };
}

/** « 14 h – 16 h », ou « 8 h – 9 h, 10 h – 11 h » : les heures manquées, regroupées quand elles se suivent. */
function absentSpan(startsIso: string, endsIso: string, count: number, absent: number[], tz: string): string {
  const fmt = (iso: string) => {
    const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).split(':');
    return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
  };
  const hours = courseHours(startsIso, endsIso, count);
  const wanted = absent.length > 0 ? [...absent].sort((a, b) => a - b) : hours.map((h) => h.hour);
  const parts: string[] = [];
  let i = 0;
  while (i < wanted.length) {
    let j = i;
    while (j + 1 < wanted.length && wanted[j + 1] === wanted[j]! + 1) j++;
    const a = hours[wanted[i]! - 1];
    const b = hours[wanted[j]! - 1];
    if (a && b) parts.push(`${fmt(a.startsIso)} – ${fmt(b.endsIso)}`);
    i = j + 1;
  }
  return parts.join(', ');
}
