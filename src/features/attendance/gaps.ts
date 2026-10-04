import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { readSettings, writeSettings } from '@/features/settings/school-settings';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { audit } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import {
  cleanReasons,
  GAP_NOTE_MAX,
  REASON_CODE_MAX,
  callWasMade,
  reasonsProblem,
  windowProblem,
  type GapReason,
  type MissingCall,
} from './gap-types';

/**
 * Les creneaux passes sans appel.
 *
 * Un cours passe sans appel laisse ses eleves « non renseignes » : ni presents,
 * ni absents. Les statistiques mentent alors par omission, et personne ne le
 * voit. Cet ecran le rend visible.
 *
 * Mais il N'ACCUSE PERSONNE : il demande qu'on QUALIFIE. L'enseignant etait-il
 * absent, le cours n'a-t-il pas eu lieu, l'appel a-t-il ete oublie ? Seul
 * quelqu'un qui sait peut le dire.
 */

export type { MissingCall } from './gap-types';

function hm(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export { MAX_WINDOW_DAYS, windowProblem } from './gap-types';

/**
 * Les creneaux termines dont l'appel n'a pas ete SOUMIS.
 *
 * Un registre reste « ouvert » quand l'enseignant a commence sans finir : pour
 * la vie scolaire, c'est un appel manquant tout autant qu'une absence de
 * registre — les eleves n'y sont ni presents ni absents.
 */
export async function listMissingCalls(ctx: TenantContext, from: string, to: string): Promise<MissingCall[]> {
  const probleme = windowProblem(from, to);
  if (probleme) throw new ValidationError(probleme);

  const supabase = await createClient();
  // L'appel et la qualification sont ramenes EN RELATION, pas par une seconde
  // requete filtree sur les identifiants : PostgREST passe ses filtres dans
  // l'URL, et quatre cents identifiants la font deborder — la requete echouait
  // alors en silence, et tous les creneaux paraissaient sans appel.
  const colonnes =
    'id, occurs_on, starts_at, ends_at, ' +
    'schedule_sessions(subjects(name), ' +
    'schedule_session_targets(classes(name)), ' +
    'schedule_session_teachers(teacher_id, teachers(first_name, last_name))), ' +
    'attendance_registers(status), ' +
    'attendance_gaps(reason, note, reviewed_at)';

  const maintenant = new Date().toISOString();
  const occurrences = await fetchAllRows<Brute>((cursor) => {
    let q = supabase
      .from('session_occurrences')
      .select(colonnes)
      .eq('school_id', ctx.school.id)
      .eq('status', 'SCHEDULED')
      .gte('occurs_on', from)
      .lte('occurs_on', to)
      .lt('ends_at', maintenant)
      .order('id')
      .limit(PAGE);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: Brute[] | null; error: { message: string } | null }>;
  }, PAGE);

  return occurrences
    .filter((o) => !callWasMade(unique(o.attendance_registers)?.status))
    .map((o) => {
      const affectation = o.schedule_sessions?.schedule_session_teachers?.[0] ?? null;
      const t = affectation?.teachers ?? null;
      const g = unique(o.attendance_gaps);
      return {
        occurrenceId: o.id,
        date: o.occurs_on,
        startsAt: hm(o.starts_at),
        endsAt: hm(o.ends_at),
        subject: o.schedule_sessions?.subjects?.name ?? 'Cours',
        klass: o.schedule_sessions?.schedule_session_targets?.[0]?.classes?.name ?? '—',
        teacherId: affectation?.teacher_id ?? null,
        teacher: t ? `${t.last_name.toUpperCase()} ${t.first_name}` : null,
        reason: g?.reason ?? null,
        note: g?.note ?? null,
        reviewedAt: g?.reviewed_at ?? null,
      };
    })
    // Le curseur impose l'ordre des identifiants : on remet l'ordre lisible,
    // le plus recent d'abord.
    .sort((a, b) => (a.date === b.date ? b.startsAt.localeCompare(a.startsAt) : b.date.localeCompare(a.date)));
}

/** Une page de curseur : assez grande pour une semaine entiere. */
const PAGE = 1000;

type Brute = {
  id: string;
  occurs_on: string;
  starts_at: string;
  ends_at: string;
  schedule_sessions: {
    subjects: { name: string } | null;
    schedule_session_targets: { classes: { name: string } | null }[];
    schedule_session_teachers: { teacher_id: string; teachers: { first_name: string; last_name: string } | null }[];
  } | null;
  // PostgREST rend une relation UNIQUE comme un objet, pas comme un tableau :
  // `attendance_registers` et `attendance_gaps` portent toutes deux une
  // contrainte d'unicite sur l'occurrence. On accepte les deux formes, pour ne
  // pas dependre d'un detail qui se lit mal.
  attendance_registers: Unique<{ status: string }>;
  attendance_gaps: Unique<{ reason: string; note: string | null; reviewed_at: string }>;
};

type Unique<T> = T | T[] | null;

function unique<T>(valeur: Unique<T>): T | null {
  if (!valeur) return null;
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur;
}

/** Dire pourquoi l'appel n'a pas ete fait. */
export async function qualifyGap(
  ctx: TenantContext,
  occurrenceId: string,
  reason: string,
  note: string,
): Promise<void> {
  requireWritable(ctx, 'attendance.missing_calls');
  const code = reason.trim().slice(0, REASON_CODE_MAX);
  if (!code) throw new ValidationError('Choisissez un motif.');

  const reasons = await readGapReasons(ctx);
  if (!reasons.some((r) => r.code === code)) throw new ValidationError('Motif inconnu.');

  const supabase = await createClient();
  const { error } = await supabase.from('attendance_gaps').upsert(
    {
      school_id: ctx.school.id,
      session_occurrence_id: occurrenceId,
      reason: code,
      note: note.trim().slice(0, GAP_NOTE_MAX) || null,
      reviewed_by: ctx.user.id,
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: 'session_occurrence_id' },
  );
  if (error) throw error;

  await audit(ctx, {
    action: 'attendance.gap_qualify',
    module: 'attendance',
    entityType: 'session_occurrence',
    entityId: occurrenceId,
    after: { reason: code, note: note.trim() || null },
  });
}

/** Retirer une qualification posee par erreur. */
export async function clearGap(ctx: TenantContext, occurrenceId: string): Promise<void> {
  requireWritable(ctx, 'attendance.missing_calls');
  const supabase = await createClient();
  const { error } = await supabase
    .from('attendance_gaps')
    .delete()
    .eq('school_id', ctx.school.id)
    .eq('session_occurrence_id', occurrenceId);
  if (error) throw error;
  await audit(ctx, {
    action: 'attendance.gap_clear',
    module: 'attendance',
    entityType: 'session_occurrence',
    entityId: occurrenceId,
  });
}

// --- Les motifs, regles par l'etablissement ---------------------------------

export async function readGapReasons(ctx: TenantContext): Promise<GapReason[]> {
  const s = await readSettings(ctx, 'attendance');
  return cleanReasons(s.gapReasons);
}

export async function writeGapReasons(ctx: TenantContext, reasons: GapReason[]): Promise<void> {
  const probleme = reasonsProblem(reasons);
  if (probleme) throw new ValidationError(probleme);
  await writeSettings(ctx, 'attendance', { gapReasons: reasons });
}
