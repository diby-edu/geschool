import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { getMyTeacherId, getMyPublishedSessions } from '@/features/schedule/my-schedule';
import { schoolToday } from '@/features/dashboard/time';
import { clock, coversNow } from './day-phase';
import { audienceOf, TARGETS_SELECT, type SessionTarget } from './targets';

/**
 * Detection du « cours actuel » d'un enseignant (module Presence, cahier des
 * charges §3) : identifie automatiquement la seance de son emploi du temps
 * dont le creneau couvre l'instant present, sans lui faire choisir une
 * classe.
 *
 * AUCUNE MARGE, ni avant ni apres : l'appel n'existe que pendant le cours.
 * Une marge apres la fin ferait se contredire deux cours qui se suivent — un
 * enseignant dont l'heure s'acheve a 8h00 marquerait un eleve absent a 8h05,
 * alors que le suivant vient de le noter present a 8h00.
 */

const GRACE_MINUTES = 0;

export type CurrentCourseOption = {
  occurrenceId: string;
  classId: string | null;
  klass: string;
  subject: string;
  /** Heure affichee, dans le fuseau de l'etablissement (« 07:00 »). */
  startsAt: string;
  endsAt: string;
  /** Instant complet du debut : le retard se mesure a partir de lui. */
  startsIso: string;
  registerStatus: string | null;
};

/** Séance datée de l'enseignant, pour un jour donné (tableau de bord, cours actuel). */
export type TeacherDaySession = CurrentCourseOption & { endsIso: string };

/**
 * Séances de CE jour de la version publiée où l'enseignant intervient, avec
 * l'état de leur appel. Horaires : instants complets (une séance déplacée garde
 * ses horaires de remplacement), affichés dans le fuseau de l'établissement.
 */
export async function listMySessionsOn(ctx: TenantContext, teacherId: string, day: string): Promise<TeacherDaySession[]> {
  const sessions = await getMyPublishedSessions(ctx, teacherId);
  if (sessions.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('session_occurrences')
    .select(
      'id, starts_at, ends_at, override_starts_at, override_ends_at, attendance_registers(status), ' +
        `schedule_sessions(subjects(name), ${TARGETS_SELECT})`,
    )
    .eq('school_id', ctx.school.id)
    .in('schedule_session_id', sessions.map((s) => s.id))
    .eq('occurs_on', day)
    .eq('status', 'SCHEDULED');

  const rows = (data ?? []) as unknown as {
    id: string;
    starts_at: string;
    ends_at: string;
    override_starts_at: string | null;
    override_ends_at: string | null;
    attendance_registers: { status: string } | null;
    schedule_sessions: {
      subjects: { name: string } | null;
      schedule_session_targets: SessionTarget[];
    } | null;
  }[];
  if (rows.length === 0) return [];


  const tz = ctx.school.timezone;
  return rows
    .map((r) => {
      const audience = audienceOf(r.schedule_sessions?.schedule_session_targets);
      const startsIso = r.override_starts_at ?? r.starts_at;
      const endsIso = r.override_ends_at ?? r.ends_at;
      return {
        occurrenceId: r.id,
        classId: audience.classIds[0] ?? null,
        klass: audience.label,
        subject: r.schedule_sessions?.subjects?.name ?? 'Cours',
        startsIso,
        endsIso,
        startsAt: clock(startsIso, tz),
        endsAt: clock(endsIso, tz),
        registerStatus: r.attendance_registers?.status ?? null,
      };
    })
    .sort((a, b) => a.startsIso.localeCompare(b.startsIso));
}

export async function getCurrentCoursesForTeacher(ctx: TenantContext): Promise<CurrentCourseOption[]> {
  const teacherId = await getMyTeacherId(ctx);
  if (!teacherId) return [];

  // « Aujourd'hui » et « maintenant » : ceux de l'établissement, comparés en
  // instants complets (l'ancienne comparaison de chaînes « HH:MM » sur des
  // horodatages ne trouvait jamais le cours en cours).
  const now = new Date();
  const sessions = await listMySessionsOn(ctx, teacherId, schoolToday(ctx.school.timezone, now));
  return sessions
    .filter((s) => coversNow(s.startsIso, s.endsIso, now, GRACE_MINUTES))
    .map(({ endsIso: _e, ...course }) => course);
}
