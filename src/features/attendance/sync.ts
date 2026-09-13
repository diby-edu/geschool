import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';
import { AuthorizationError, NotFoundError, ValidationError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database';
import { getAppliedSyncResult, recordAppliedSyncOperation } from '@/services/sync-ledger';
import { canActOnOccurrence } from './registers';
import type { AttendanceEntry } from './schemas';

export type SaveResult = { registerId: string; deduped: boolean; savedCount: number };

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
  input: { clientOperationId: string; occurrenceId: string; entries: AttendanceEntry[]; source: 'ONLINE' | 'OFFLINE_SYNC' },
): Promise<SaveResult> {
  const supabase = await createClient();

  // 1. Opération déjà vue ? Renvoyer son résultat mémorisé (idempotence).
  const seen = await getAppliedSyncResult(ctx.school.id, input.clientOperationId);
  if (seen?.registerId) {
    return { registerId: seen.registerId, deduped: true, savedCount: seen.savedCount ?? 0 };
  }

  // 2. L'occurrence existe-t-elle dans cet établissement ?
  const { data: occ } = await supabase
    .from('session_occurrences')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('id', input.occurrenceId)
    .maybeSingle();
  if (!occ) throw new NotFoundError('Séance introuvable.');

  // Droit d'agir : permission générale (censeur/direction) OU enseignant de
  // cette séance précise (perimètre dérivé, RLS 0015 — jamais accordé en
  // permission générale au rôle TEACHER par conception).
  if (!(await canActOnOccurrence(ctx, input.occurrenceId))) {
    throw new AuthorizationError("Vous n'êtes pas habilité à faire l'appel de cette séance.");
  }

  // 3. Registre : réutiliser celui de l'occurrence, ou le créer (statut OPEN).
  let registerId: string;
  const { data: existing } = await supabase
    .from('attendance_registers')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('session_occurrence_id', input.occurrenceId)
    .maybeSingle();
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

  // 4. Enregistrements par élève (upsert), avec validation serveur.
  const rows: TablesInsert<'attendance_records'>[] = input.entries.map((e) => {
    if (e.status === 'LATE' && e.minutesLate <= 0) {
      throw new ValidationError('Un retard doit préciser une durée en minutes.');
    }
    return {
      school_id: ctx.school.id,
      register_id: registerId,
      student_id: e.studentId,
      status: e.status,
      minutes_late: e.status === 'LATE' ? e.minutesLate : 0,
      comment: e.comment || null,
      recorded_by: ctx.user.id,
    };
  });
  if (rows.length > 0) {
    const { error } = await supabase.from('attendance_records').upsert(rows, { onConflict: 'register_id,student_id' });
    if (error) throw error;
  }

  // 5. Journaliser l'opération dans le registre d'idempotence (service_role).
  await recordAppliedSyncOperation({
    schoolId: ctx.school.id,
    userId: ctx.user.id,
    clientOperationId: input.clientOperationId,
    operationType: 'attendance.save',
    payload: { occurrenceId: input.occurrenceId, count: rows.length },
    result: { registerId, savedCount: rows.length },
  });

  await audit(ctx, {
    action: 'attendance.save',
    module: 'attendance',
    entityType: 'attendance_register',
    entityId: registerId,
    after: { count: rows.length, source: input.source },
  });

  return { registerId, deduped: false, savedCount: rows.length };
}
