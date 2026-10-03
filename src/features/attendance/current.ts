import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { getMyTeacherId, getMyPublishedSessions } from '@/features/schedule/my-schedule';
import { schoolToday } from '@/features/dashboard/time';
import { clock, coversNow } from './day-phase';

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
      'id, starts_at, ends_at, override_starts_at, override_ends_at, ' +
        'schedule_sessions(subjects(name), schedule_session_targets(class_id, classes(name)))',
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
    schedule_sessions: {
      subjects: { name: string } | null;
      schedule_session_targets: { class_id: string | null; classes: { name: string } | null }[];
    } | null;
  }[];
  if (rows.length === 0) return [];

  const { data: regs } = await supabase
    .from('attendance_registers')
    .select('session_occurrence_id, status')
    .eq('school_id', ctx.school.id)
    .in('session_occurrence_id', rows.map((r) => r.id));
  const statusByOcc = new Map((regs ?? []).map((r) => [r.session_occurrence_id, r.status]));

  const tz = ctx.school.timezone;
  return rows
    .map((r) => {
      const target = r.schedule_sessions?.schedule_session_targets?.[0] ?? null;
      const startsIso = r.override_starts_at ?? r.starts_at;
      const endsIso = r.override_ends_at ?? r.ends_at;
      return {
        occurrenceId: r.id,
        classId: target?.class_id ?? null,
        klass: target?.classes?.name ?? '—',
        subject: r.schedule_sessions?.subjects?.name ?? 'Cours',
        startsIso,
        endsIso,
        startsAt: clock(startsIso, tz),
        endsAt: clock(endsIso, tz),
        registerStatus: statusByOcc.get(r.id) ?? null,
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
