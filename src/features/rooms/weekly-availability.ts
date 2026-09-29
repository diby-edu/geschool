import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';

/**
 * Indisponibilité HEBDOMADAIRE d'une salle : « la salle B12 est prêtée tous les
 * mercredis de 8 h à 10 h », « le gymnase sert au club le vendredi après-midi ».
 *
 * À distinguer de `room_closures` (0069), qui ferme la salle sur des DATES
 * précises (travaux du 5 au 20 novembre). Ici, la règle revient chaque semaine :
 * elle appartient à l'emploi du temps, pas aux imprévus.
 */

export type RoomSlotRule = {
  id: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export async function listRoomRules(ctx: TenantContext, roomId: string): Promise<RoomSlotRule[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('room_availability')
    .select('id, day_of_week, starts_at, ends_at, reason')
    .eq('school_id', ctx.school.id)
    .eq('room_id', roomId)
    .eq('academic_year_id', yearId)
    .eq('kind', 'UNAVAILABLE')
    .order('day_of_week')
    .order('starts_at');
  return ((data ?? []) as { id: string; day_of_week: number; starts_at: string; ends_at: string; reason: string | null }[]).map(
    (r) => ({
      id: r.id,
      dayOfWeek: r.day_of_week,
      startsAt: r.starts_at.slice(0, 5),
      endsAt: r.ends_at.slice(0, 5),
      reason: r.reason,
    }),
  );
}

/** Toutes les règles de l'année, pour la génération et la recherche de salles libres. */
export async function listAllRoomRules(ctx: TenantContext): Promise<(RoomSlotRule & { roomId: string })[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('room_availability')
    .select('id, room_id, day_of_week, starts_at, ends_at, reason')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('kind', 'UNAVAILABLE');
  return ((data ?? []) as {
    id: string;
    room_id: string;
    day_of_week: number;
    starts_at: string;
    ends_at: string;
    reason: string | null;
  }[]).map((r) => ({
    id: r.id,
    roomId: r.room_id,
    dayOfWeek: r.day_of_week,
    startsAt: r.starts_at.slice(0, 5),
    endsAt: r.ends_at.slice(0, 5),
    reason: r.reason,
  }));
}

export async function createRoomRule(
  ctx: TenantContext,
  input: { roomId: string; dayOfWeek: number; startsAt: string; endsAt: string; reason: string },
): Promise<void> {
  requireWritable(ctx, 'rooms.manage_availability');
  const yearId = ctx.academicYear?.id;
  if (!yearId) throw new ValidationError('Activez une année scolaire d’abord.');
  if (input.endsAt <= input.startsAt) throw new ValidationError('L’heure de fin doit suivre l’heure de début.');
  if (input.dayOfWeek < 1 || input.dayOfWeek > 7) throw new ValidationError('Jour invalide.');

  const supabase = await createClient();
  const { error } = await supabase.from('room_availability').insert({
    school_id: ctx.school.id,
    room_id: input.roomId,
    academic_year_id: yearId,
    day_of_week: input.dayOfWeek,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    kind: 'UNAVAILABLE',
    reason: input.reason || null,
  });
  if (error) throw error;
  await audit(ctx, {
    action: 'rooms.weekly_rule_create',
    module: 'rooms',
    entityType: 'room',
    entityId: input.roomId,
    after: input,
  });
}

export async function deleteRoomRule(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'rooms.manage_availability');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('room_availability')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Règle introuvable.');
  await audit(ctx, { action: 'rooms.weekly_rule_delete', module: 'rooms', entityType: 'room', entityId: id });
}
