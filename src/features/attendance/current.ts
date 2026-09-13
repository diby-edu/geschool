import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { getMyTeacherId, getMyPublishedSessions } from '@/features/schedule/my-schedule';

/**
 * Detection du « cours actuel » d'un enseignant (module Presence, cahier des
 * charges §3) : identifie automatiquement la seance de son emploi du temps
 * dont le creneau couvre l'instant present, sans lui faire choisir une
 * classe. Une marge de 10 minutes de part et d'autre absorbe les debuts /
 * fins de cours legerement decales, sans faire disparaitre le cours trop tot.
 */

const GRACE_MINUTES = 10;

export type CurrentCourseOption = {
  occurrenceId: string;
  classId: string | null;
  klass: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  registerStatus: string | null;
};

function toMinutes(hm: string): number {
  const [h, m] = hm.slice(0, 5).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export async function getCurrentCoursesForTeacher(ctx: TenantContext): Promise<CurrentCourseOption[]> {
  const teacherId = await getMyTeacherId(ctx);
  if (!teacherId) return [];

  const sessions = await getMyPublishedSessions(ctx, teacherId);
  if (sessions.length === 0) return [];
  const sessionIds = sessions.map((s) => s.id);

  const supabase = await createClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const { data } = await supabase
    .from('session_occurrences')
    .select(
      'id, starts_at, ends_at, schedule_session_id, ' +
        'schedule_sessions(subjects(name), schedule_session_targets(class_id, classes(name)))',
    )
    .in('schedule_session_id', sessionIds)
    .eq('occurs_on', today)
    .eq('status', 'SCHEDULED');

  const rows = (data ?? []) as unknown as {
    id: string;
    starts_at: string;
    ends_at: string;
    schedule_sessions: {
      subjects: { name: string } | null;
      schedule_session_targets: { class_id: string | null; classes: { name: string } | null }[];
    } | null;
  }[];

  const current = rows.filter((r) => {
    const start = toMinutes(r.starts_at) - GRACE_MINUTES;
    const end = toMinutes(r.ends_at) + GRACE_MINUTES;
    return nowMinutes >= start && nowMinutes <= end;
  });
  if (current.length === 0) return [];

  const ids = current.map((r) => r.id);
  const { data: regs } = await supabase
    .from('attendance_registers')
    .select('session_occurrence_id, status')
    .eq('school_id', ctx.school.id)
    .in('session_occurrence_id', ids);
  const statusByOcc = new Map((regs ?? []).map((r) => [r.session_occurrence_id, r.status]));

  return current
    .map((r) => {
      const target = r.schedule_sessions?.schedule_session_targets?.[0] ?? null;
      return {
        occurrenceId: r.id,
        classId: target?.class_id ?? null,
        klass: target?.classes?.name ?? '—',
        subject: r.schedule_sessions?.subjects?.name ?? 'Cours',
        startsAt: r.starts_at.slice(0, 5),
        endsAt: r.ends_at.slice(0, 5),
        registerStatus: statusByOcc.get(r.id) ?? null,
      };
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
