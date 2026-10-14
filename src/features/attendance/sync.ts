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
import { clampLateMinutes } from './targets';
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

  // 4. Enregistrements par élève (upsert), avec validation serveur. Seuls
  // les élèves attendus à ce cours sont retenus : une requête forgée ne peut
  // pas marquer absent un élève d'une autre classe. Un élève sorti du cours
  // entre l'appel hors ligne et son envoi est écarté, sans perdre les autres.
  const expected = new Set((await loadRoster(ctx, occ)).map((r) => r.studentId));
  const kept = input.entries.filter((e) => expected.has(e.studentId));
  const ignoredCount = input.entries.length - kept.length;
  const takenAt = replayAt ?? new Date().toISOString();
  const rows: TablesInsert<'attendance_records'>[] = kept.map((e) => ({
    school_id: ctx.school.id,
    register_id: registerId,
    student_id: e.studentId,
    status: e.status,
    // Le retard se déduit de l'heure du clic ; il ne dépasse jamais le cours.
    minutes_late: e.status === 'LATE' ? clampLateMinutes(e.minutesLate, occ.starts_iso, occ.ends_iso) : 0,
    comment: e.comment || null,
    recorded_by: ctx.user.id,
    taken_at: takenAt,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from('attendance_records').upsert(rows, { onConflict: 'register_id,student_id' });
    if (error) throw error;
  }

  // 5. Verrouillage enchaine (« Valider l'appel » du tableau de bord
  // enseignant) : deja soumis/valide entre-temps (ex. rejeu apres une
  // premiere tentative interrompue) -> rien a refaire, ce n'est pas une erreur.
  let submitted = false;
  if (input.alsoSubmit) {
    const { data: reg } = await supabase
      .from('attendance_registers')
      .select('status')
      .eq('school_id', ctx.school.id)
      .eq('id', registerId)
      .maybeSingle();
    if (reg?.status === 'OPEN') {
      await submitRegister(ctx, registerId, replayAt ?? undefined);
    }
    submitted = true;
  }

  // 6. Journaliser l'opération dans le registre d'idempotence (service_role).
  await recordAppliedSyncOperation({
    schoolId: ctx.school.id,
    userId: ctx.user.id,
    clientOperationId: input.clientOperationId,
    operationType: 'attendance.save',
    payload: {
      occurrenceId: input.occurrenceId,
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
      count: rows.length,
      source: input.source,
      submitted,
      ...(replayAt ? { takenAt: replayAt, receivedAt: new Date().toISOString() } : {}),
      ...(ignoredCount > 0 ? { ignored: ignoredCount } : {}),
    },
  });

  return { registerId, deduped: false, savedCount: rows.length, submitted, ignoredCount };
}
