import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Emploi du temps GLOBAL d'un enseignant : une seule vue hebdomadaire,
 * toutes classes confondues, sans selection prealable — a la difference du
 * module admin (src/app/e/[slug]/(app)/schedule) qui gere les versions.
 * Reutilise entierement les memes tables (aucune logique parallele) : la
 * version PUBLIEE de l'annee courante est la seule source, exactement
 * comme pour l'appel et la generation.
 */

export type MyScheduleSlot = {
  sessionId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  subject: string;
  className: string;
  room: string | null;
};

function hm(t: string): string {
  return t.slice(0, 5);
}

export async function getMyWeeklySchedule(ctx: TenantContext): Promise<MyScheduleSlot[]> {
  const supabase = await createClient();
  const schoolId = ctx.school.id;
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];

  const { data: teacherRow } = await supabase
    .from('teachers')
    .select('id')
    .eq('school_id', schoolId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (!teacherRow) return [];

  const { data: version } = await supabase
    .from('schedule_versions')
    .select('id')
    .eq('school_id', schoolId)
    .eq('academic_year_id', yearId)
    .eq('status', 'PUBLISHED')
    .maybeSingle();
  if (!version) return [];

  const { data: rows } = await supabase
    .from('schedule_session_teachers')
    .select(
      'session_id, schedule_sessions!inner(id, day_of_week, starts_at, ends_at, schedule_version_id, subjects(name))',
    )
    .eq('teacher_id', teacherRow.id)
    .eq('schedule_sessions.schedule_version_id', version.id);

  type SessionRow = {
    session_id: string;
    schedule_sessions: {
      id: string;
      day_of_week: number;
      starts_at: string;
      ends_at: string;
      subjects: { name: string } | null;
    } | null;
  };
  const sessions = ((rows ?? []) as unknown as SessionRow[])
    .map((r) => r.schedule_sessions)
    .filter((s): s is NonNullable<SessionRow['schedule_sessions']> => s !== null);
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const [{ data: targetRows }, { data: roomRows }] = await Promise.all([
    supabase
      .from('schedule_session_targets')
      .select('session_id, classes(name), groups(name)')
      .in('session_id', sessionIds),
    supabase.from('schedule_session_rooms').select('session_id, rooms(name)').in('session_id', sessionIds),
  ]);

  const classByTarget = new Map<string, string>();
  for (const t of (targetRows ?? []) as unknown as {
    session_id: string;
    classes: { name: string } | null;
    groups: { name: string } | null;
  }[]) {
    const label = t.classes?.name ?? t.groups?.name;
    if (label) classByTarget.set(t.session_id, label);
  }
  const roomBySession = new Map<string, string>();
  for (const r of (roomRows ?? []) as unknown as { session_id: string; rooms: { name: string } | null }[]) {
    if (r.rooms) roomBySession.set(r.session_id, r.rooms.name);
  }

  return sessions
    .map((s) => ({
      sessionId: s.id,
      dayOfWeek: s.day_of_week,
      startsAt: hm(s.starts_at),
      endsAt: hm(s.ends_at),
      subject: s.subjects?.name ?? 'Cours',
      className: classByTarget.get(s.id) ?? '—',
      room: roomBySession.get(s.id) ?? null,
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startsAt.localeCompare(b.startsAt));
}
