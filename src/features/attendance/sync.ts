import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';
import { AuthorizationError, ConflictError, NotFoundError } from '@/lib/errors';
import { hasPermission } from '@/lib/permissions';
import type { TablesInsert } from '@/types/database';
import { getAppliedSyncResult, recordAppliedSyncOperation } from '@/services/sync-ledger';
import { canActOnOccurrence, loadRoster, submitRegister } from './registers';
import { getOccurrence } from './occurrences';
import { courseHours as courseHourList, hourAt, mergeAbsentHours } from './course-hours';
import type { AttendanceEntry } from './schemas';

export type SaveResult = {
  registerId: string;
  deduped: boolean;
  savedCount: number;
  submitted: boolean;
  /** Élèves reçus qui ne sont pas (ou plus) attendus à ce cours : écartés. */
  ignoredCount?: number;
};

/**
 * Applique un appel de façon IDEMPOTENTE (ADR-009, docs/OFFLINE_SYNC.md).
 *
 * Deux barrières :
 *  1. `sync_operations` (unique school + client_operation_id) : une opération
 *     déjà appliquée renvoie son résultat mémorisé, sans rien rejouer.
 *  2. `attendance_registers` (unique par occurrence) : même sans le ledger, un
 *     cours ne peut avoir qu'un seul registre.
 *
 * La même fonction sert l'appel en ligne et le rejeu d'un appel saisi hors
 * ligne ; seul `source` change.
 */
export async function applyAttendanceSave(
  ctx: TenantContext,
  input: {
    clientOperationId: string;
    occurrenceId: string;
    entries: AttendanceEntry[];
    source: 'ONLINE' | 'OFFLINE_SYNC';
    /** Enchaine le verrouillage (submitRegister) juste apres l'enregistrement. */
    alsoSubmit?: boolean;
    /** Instant où l'appel a été fait (appareil). Pris en compte au rejeu hors ligne. */
    takenAt?: string;
  },
): Promise<SaveResult> {
  const supabase = await createClient();

  // 1. Opération déjà vue ? Renvoyer son résultat mémorisé (idempotence). Le
  // ledger n'est écrit qu'une fois l'operation ENTIEREMENT terminee (y
  // compris le verrouillage demandé) : le retrouver garantit que tout est
  // fait, pas seulement l'enregistrement.
  const seen = await getAppliedSyncResult(ctx.school.id, input.clientOperationId);
  if (seen?.registerId) {
    return { registerId: seen.registerId, deduped: true, savedCount: seen.savedCount ?? 0, submitted: seen.submitted ?? false };
  }

  // 2. L'occurrence existe-t-elle dans cet établissement ?
  const occ = await getOccurrence(ctx, input.occurrenceId);
  if (!occ) throw new NotFoundError('Séance introuvable.');

  // Droit d'agir : permission générale (vie scolaire) OU enseignant de cette
  // séance PENDANT le créneau (RLS 0084). Un appel fait hors ligne et reçu
  // après la fin du cours se juge à l'instant où il a été FAIT (0105) : un
  // appel fait sans réseau n'est jamais perdu, quelle que soit la coupure.
  let replayAt: string | null = null;
  if (!(await canActOnOccurrence(ctx, input.occurrenceId))) {
    if (input.source === 'OFFLINE_SYNC' && input.takenAt) {
      const { data: okAt } = await supabase.rpc('can_take_attendance_at' as never, {
        p_school: ctx.school.id,
        p_occurrence: input.occurrenceId,
        p_at: input.takenAt,
      } as never);
      if (okAt === true) replayAt = input.takenAt;
    }
    if (!replayAt) {
      throw new AuthorizationError(
        input.source === 'OFFLINE_SYNC'
          ? "Appel refusé : l'heure notée par l'appareil ne tombe pas dans le créneau de ce cours (horloge du téléphone à vérifier)."
          : "Vous n'êtes pas habilité à faire l'appel de cette séance.",
      );
    }
  }

  // 3. Registre : réutiliser celui de l'occurrence, ou le créer (statut OPEN).
  let registerId: string;
  const { data: existing } = await supabase
    .from('attendance_registers')
    .select('id, status')
    .eq('school_id', ctx.school.id)
    .eq('session_occurrence_id', input.occurrenceId)
    .maybeSingle();
  if (existing?.status === 'VALIDATED' && !hasPermission(ctx, 'attendance.update')) {
    throw new ConflictError('Cet appel a été validé par la vie scolaire : il ne peut plus être modifié.');
  }
  if (existing) {
    registerId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from('attendance_registers')
      .insert({
        school_id: ctx.school.id,
        session_occurrence_id: input.occurrenceId,
        taken_by: ctx.user.id,
        status: 'OPEN',
        client_operation_id: input.clientOperationId,
        source: input.source,
        ...(replayAt ? { taken_at: replayAt } : {}),
      })
      .select('id')
      .single();
    if (error) {
      // Course : un autre appel a créé le registre entre-temps.
      if ((error as { code?: string }).code === '23505') {
        const { data: again } = await supabase
          .from('attendance_registers')
          .select('id')
          .eq('school_id', ctx.school.id)
          .eq('session_occurrence_id', input.occurrenceId)
          .maybeSingle();
        if (!again) throw error;
        registerId = again.id;
      } else {
        throw error;
      }
    } else {
      registerId = created.id;
    }
  }

  // 4. L'heure dont c'est l'appel (0170) : celle qui couvre l'instant où il a
  // été fait. Un cours d'1 h n'en a qu'une ; dans un cours de 3 h, l'appel de
  // 15 h ne touche que la 2e heure, jamais celles déjà passées.
  const takenAt = replayAt ?? new Date().toISOString();
  const { data: count } = await supabase.rpc('occurrence_course_hours' as never, {
    p_school: ctx.school.id,
    p_occurrence: input.occurrenceId,
  } as never);
  const courseHours = typeof count === 'number' && count > 0 ? count : 1;
  const hour = hourAt(occ.starts_iso, occ.ends_iso, courseHours, Date.parse(takenAt));
  if (hour === null) {
    throw new ConflictError("Le cours n'est pas en cours : son appel ne peut plus être fait.");
  }

  // 5. Enregistrements par élève (upsert), avec validation serveur. Seuls
  // les élèves attendus à ce cours sont retenus : une requête forgée ne peut
  // pas marquer absent un élève d'une autre classe. Un élève sorti du cours
  // entre l'appel hors ligne et son envoi est écarté, sans perdre les autres.
  // Deux états seulement : présent ou absent (le retard a disparu, 0170).
  const expected = new Set((await loadRoster(ctx, occ)).map((r) => r.studentId));
  const kept = input.entries.filter((e) => expected.has(e.studentId));
  const ignoredCount = input.entries.length - kept.length;
  const { data: previousRows } = await supabase
    .from('attendance_records')
    .select('student_id, status, absent_hours')
    .eq('school_id', ctx.school.id)
    .eq('register_id', registerId);
  const previous = new Map(
    ((previousRows ?? []) as unknown as { student_id: string; status: string; absent_hours: number[] | null }[]).map((r) => [r.student_id, r]),
  );
  const rows: TablesInsert<'attendance_records'>[] = kept.map((e) => {
    const before = previous.get(e.studentId);
    const absentHours = mergeAbsentHours(before?.absent_hours ?? [], hour, e.status === 'ABSENT');
    // Une absence déjà justifiée le reste tant qu'il reste une heure d'absence.
    const status = absentHours.length === 0 ? 'PRESENT' : before?.status === 'EXCUSED' ? 'EXCUSED' : 'ABSENT';
    return {
      school_id: ctx.school.id,
      register_id: registerId,
      student_id: e.studentId,
      status,
      minutes_late: 0,
      absent_hours: absentHours,
      comment: e.comment || null,
      recorded_by: ctx.user.id,
      taken_at: takenAt,
    } as TablesInsert<'attendance_records'>;
  });
  if (rows.length > 0) {
    const { error } = await supabase.from('attendance_records').upsert(rows, { onConflict: 'register_id,student_id' });
    if (error) throw error;
  }

  // 6. « Valider l'appel de 15 h » : l'heure est faite (0170). Validé par la
  // vie scolaire entre-temps -> rien a refaire, ce n'est pas une erreur. Le
  // même instant que les lignes : la base retrouve la même heure.
  let submitted = false;
  if (input.alsoSubmit) {
    const { data: reg } = await supabase
      .from('attendance_registers')
      .select('status')
      .eq('school_id', ctx.school.id)
      .eq('id', registerId)
      .maybeSingle();
    if (reg?.status !== 'VALIDATED') {
      await submitRegister(ctx, registerId, takenAt);
    }
    submitted = true;
  }

  // Les familles des élèves absents À CETTE HEURE (et pas déjà notés absents à
  // cette heure) sont prévenues : une notification par heure d'absence (0171).
  if (submitted) {
    const nouveaux = rows
      .filter((r) => ((r as { absent_hours?: number[] }).absent_hours ?? []).includes(hour) && !previous.get(r.student_id)?.absent_hours?.includes(hour))
      .map((r) => r.student_id);
    if (nouveaux.length > 0) {
      const h = courseHourList(occ.starts_iso, occ.ends_iso, courseHours)[hour - 1];
      const tz = ctx.school.timezone;
      const fmt = (iso: string) => {
        const [hh, mm] = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).split(':');
        return mm === '00' ? `${Number(hh)} h` : `${Number(hh)} h ${mm}`;
      };
      const dayLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(occ.starts_iso));
      void import('@/services/family-notifications').then((m) => m.notifyAbsences(ctx.school.id, nouveaux, {
        subject: occ.subject,
        dayLabel,
        span: h ? `${fmt(h.startsIso)} – ${fmt(h.endsIso)}` : '',
        occurrenceId: input.occurrenceId,
      }));
    }
  }

  // 7. Journaliser l'opération dans le registre d'idempotence (service_role).
  await recordAppliedSyncOperation({
    schoolId: ctx.school.id,
    userId: ctx.user.id,
    clientOperationId: input.clientOperationId,
    operationType: 'attendance.save',
    payload: {
      occurrenceId: input.occurrenceId,
      hour,
      count: rows.length,
      alsoSubmit: input.alsoSubmit ?? false,
      ...(replayAt ? { takenAt: replayAt } : {}),
    },
    result: { registerId, savedCount: rows.length, submitted },
  });

  await audit(ctx, {
    action: 'attendance.save',
    module: 'attendance',
    entityType: 'attendance_register',
    entityId: registerId,
    // Un appel reçu après coup reste reconnaissable : la vie scolaire voit
    // l'heure où il a été fait et l'heure où il est arrivé.
    after: {
      hour,
      count: rows.length,
      source: input.source,
      submitted,
      ...(replayAt ? { takenAt: replayAt, receivedAt: new Date().toISOString() } : {}),
      ...(ignoredCount > 0 ? { ignored: ignoredCount } : {}),
    },
  });

  return { registerId, deduped: false, savedCount: rows.length, submitted, ignoredCount };
}
