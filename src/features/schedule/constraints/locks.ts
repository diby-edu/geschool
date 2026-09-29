import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError } from '@/lib/errors';

/**
 * Verrouiller une séance : elle ne bougera plus d'une régénération à l'autre.
 *
 * C'est ce qui rend l'outil utilisable dans une vraie école. Le proviseur a
 * négocié trois cours — le professeur qui vient d'un autre établissement, le
 * créneau du laboratoire partagé, l'heure de vie de classe du vendredi. Il les
 * fige, et le solveur compose autour.
 *
 * Le contrat du solveur prévoyait déjà `locked`, `fixedStartSlot` et
 * `fixedRoom` : ils étaient écrits en dur à « aucun verrou » depuis le départ.
 */

export type LockedPlacement = {
  /** L'exigence pédagogique dont vient la séance : c'est elle qui produit les tâches. */
  requirementId: string;
  /** Créneau de départ, par son identifiant de grille. */
  startSlotId: string;
  /** Salle imposée, s'il y en a une. */
  roomId: string | null;
  label: string;
};

export async function setSessionLock(ctx: TenantContext, sessionId: string, locked: boolean): Promise<void> {
  requireWritable(ctx, 'schedule.lock');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('schedule_sessions')
    .update({ is_locked: locked }, { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', sessionId);
  if (error) throw error;
  if (!count) throw new NotFoundError('Séance introuvable.');
  await audit(ctx, {
    action: locked ? 'schedule.session_lock' : 'schedule.session_unlock',
    module: 'schedule',
    entityType: 'schedule_session',
    entityId: sessionId,
  });
}

/**
 * Les séances verrouillées à reprendre telles quelles.
 *
 * On les lit dans la version visée si la génération écrit dans une version
 * existante, sinon dans la version PUBLIÉE — celle que l'école a sous les yeux
 * quand elle décide de figer un cours. Sans version publiée, aucun verrou :
 * il n'y a rien à reprendre.
 *
 * Une séance sans exigence rattachée est ignorée : on ne saurait pas à quelle
 * tâche la rattacher, et deviner produirait un emploi du temps faux.
 */
export async function lockedPlacements(
  ctx: TenantContext,
  yearId: string,
  targetVersionId?: string,
): Promise<LockedPlacement[]> {
  const supabase = await createClient();

  let versionId = targetVersionId ?? null;
  if (!versionId) {
    const { data } = await supabase
      .from('schedule_versions')
      .select('id')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('status', 'PUBLISHED')
      .maybeSingle();
    versionId = data?.id ?? null;
  }
  if (!versionId) return [];

  const { data } = await supabase
    .from('schedule_sessions')
    .select('id, teaching_requirement_id, start_slot_id, subjects(name), schedule_session_rooms(room_id)')
    .eq('school_id', ctx.school.id)
    .eq('schedule_version_id', versionId)
    .eq('is_locked', true);

  return ((data ?? []) as unknown as {
    id: string;
    teaching_requirement_id: string | null;
    start_slot_id: string;
    subjects: { name: string } | null;
    schedule_session_rooms: { room_id: string }[];
  }[])
    .filter((s) => s.teaching_requirement_id)
    .map((s) => ({
      requirementId: s.teaching_requirement_id!,
      startSlotId: s.start_slot_id,
      roomId: s.schedule_session_rooms[0]?.room_id ?? null,
      label: s.subjects?.name ?? 'Cours',
    }));
}
