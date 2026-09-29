import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { listAllRoomRules } from './weekly-availability';

/**
 * Fermeture d'une salle sur une période : travaux, examens, salle prêtée.
 *
 * Une fermeture ne déplace rien toute seule — elle ne saurait pas où mettre les
 * cours. Elle dit ce qui est touché, séance par séance, et permet de changer la
 * salle de CETTE séance-là (`session_occurrences.override_room_id`), sans
 * toucher à l'emploi du temps des autres semaines.
 */

export type ClosureRow = {
  id: string;
  roomId: string;
  roomName: string;
  startsOn: string;
  endsOn: string;
  reason: string;
  affected: number;
};

export type AffectedSession = {
  occurrenceId: string;
  occursOn: string;
  startsAt: string;
  endsAt: string;
  subject: string;
  classes: string;
};

const hm = (iso: string) => new Date(iso).toISOString().slice(11, 16);

/** Fermetures de l'année en cours, avec le nombre de séances qu'elles touchent. */
export async function listClosures(ctx: TenantContext, roomId?: string): Promise<ClosureRow[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();
  let q = supabase
    .from('room_closures')
    .select('id, room_id, starts_on, ends_on, reason, rooms(name)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('starts_on');
  if (roomId) q = q.eq('room_id', roomId);
  const { data } = await q;

  const rows = (data ?? []) as unknown as {
    id: string;
    room_id: string;
    starts_on: string;
    ends_on: string;
    reason: string;
    rooms: { name: string } | null;
  }[];

  return Promise.all(
    rows.map(async (c) => ({
      id: c.id,
      roomId: c.room_id,
      roomName: c.rooms?.name ?? '—',
      startsOn: c.starts_on,
      endsOn: c.ends_on,
      reason: c.reason,
      affected: (await affectedSessions(ctx, c.room_id, c.starts_on, c.ends_on)).length,
    })),
  );
}

/** Les séances datées prévues dans cette salle pendant la période. */
export async function affectedSessions(
  ctx: TenantContext,
  roomId: string,
  startsOn: string,
  endsOn: string,
): Promise<AffectedSession[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();

  const { data } = await supabase
    .from('session_occurrences')
    .select(
      'id, occurs_on, starts_at, ends_at, override_room_id, ' +
        'schedule_sessions(subjects(name), schedule_session_rooms(room_id), schedule_session_targets(classes(name)))',
    )
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'SCHEDULED')
    .gte('occurs_on', startsOn)
    .lte('occurs_on', endsOn)
    .order('occurs_on');

  type Raw = {
    id: string;
    occurs_on: string;
    starts_at: string;
    ends_at: string;
    override_room_id: string | null;
    schedule_sessions: {
      subjects: { name: string } | null;
      schedule_session_rooms: { room_id: string }[];
      schedule_session_targets: { classes: { name: string } | null }[];
    } | null;
  };

  return ((data ?? []) as unknown as Raw[])
    .filter((o) => {
      // Une séance déplacée à la main ne compte plus dans la salle d'origine.
      if (o.override_room_id) return o.override_room_id === roomId;
      return (o.schedule_sessions?.schedule_session_rooms ?? []).some((r) => r.room_id === roomId);
    })
    .map((o) => ({
      occurrenceId: o.id,
      occursOn: o.occurs_on,
      startsAt: hm(o.starts_at),
      endsAt: hm(o.ends_at),
      subject: o.schedule_sessions?.subjects?.name ?? 'Cours',
      classes:
        (o.schedule_sessions?.schedule_session_targets ?? [])
          .map((t) => t.classes?.name)
          .filter((n): n is string => !!n)
          .join(', ') || '—',
    }));
}

export async function createClosure(
  ctx: TenantContext,
  input: { roomId: string; startsOn: string; endsOn: string; reason: string },
): Promise<number> {
  requireWritable(ctx, 'rooms.manage_availability');
  const yearId = ctx.academicYear?.id;
  if (!yearId) throw new ValidationError('Activez une année scolaire d’abord.');
  if (input.endsOn < input.startsOn) throw new ValidationError('La date de fin ne peut pas précéder le début.');
  const supabase = await createClient();

  const { error } = await supabase.from('room_closures').insert({
    school_id: ctx.school.id,
    room_id: input.roomId,
    academic_year_id: yearId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    reason: input.reason,
    created_by: ctx.user.id,
  });
  if (error) throw error;

  const affected = await affectedSessions(ctx, input.roomId, input.startsOn, input.endsOn);
  await audit(ctx, {
    action: 'rooms.closure_create',
    module: 'rooms',
    entityType: 'room',
    entityId: input.roomId,
    after: { ...input, affected: affected.length },
  });
  return affected.length;
}

export async function deleteClosure(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'rooms.manage_availability');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('room_closures')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Fermeture introuvable.');
  await audit(ctx, { action: 'rooms.closure_delete', module: 'rooms', entityType: 'room', entityId: id });
}

/**
 * Salles libres au moment exact d'une séance : on regarde les autres séances de
 * CE jour-là, pas la semaine type — un remplacement ponctuel se juge sur la
 * date réelle. Les salles fermées ce jour-là sont écartées.
 */
export async function freeRoomsForOccurrence(
  ctx: TenantContext,
  occurrenceId: string,
): Promise<{ id: string; name: string; capacity: number }[]> {
  const supabase = await createClient();
  const { data: occ } = await supabase
    .from('session_occurrences')
    .select('id, occurs_on, starts_at, ends_at')
    .eq('school_id', ctx.school.id)
    .eq('id', occurrenceId)
    .maybeSingle();
  if (!occ) throw new NotFoundError('Séance introuvable.');

  const [{ data: rooms }, { data: sameDay }, { data: closed }] = await Promise.all([
    supabase.from('rooms').select('id, name, capacity').eq('school_id', ctx.school.id).eq('is_active', true).order('code'),
    supabase
      .from('session_occurrences')
      .select('id, starts_at, ends_at, override_room_id, schedule_sessions(schedule_session_rooms(room_id))')
      .eq('school_id', ctx.school.id)
      .eq('occurs_on', occ.occurs_on)
      .eq('status', 'SCHEDULED'),
    supabase
      .from('room_closures')
      .select('room_id')
      .eq('school_id', ctx.school.id)
      .lte('starts_on', occ.occurs_on)
      .gte('ends_on', occ.occurs_on),
  ]);

  const busy = new Set<string>();
  type Raw = {
    id: string;
    starts_at: string;
    ends_at: string;
    override_room_id: string | null;
    schedule_sessions: { schedule_session_rooms: { room_id: string }[] } | null;
  };
  for (const o of (sameDay ?? []) as unknown as Raw[]) {
    if (o.id === occurrenceId) continue;
    if (!(o.starts_at < occ.ends_at && occ.starts_at < o.ends_at)) continue;
    if (o.override_room_id) busy.add(o.override_room_id);
    else for (const r of o.schedule_sessions?.schedule_session_rooms ?? []) busy.add(r.room_id);
  }
  for (const c of closed ?? []) busy.add(c.room_id);

  // Indisponibilités hebdomadaires : le jour de la semaine de cette date.
  const weekday = ((new Date(`${occ.occurs_on}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const from = occ.starts_at.slice(11, 16);
  const to = occ.ends_at.slice(11, 16);
  for (const rule of await listAllRoomRules(ctx)) {
    if (rule.dayOfWeek !== weekday) continue;
    if (rule.startsAt >= to || from >= rule.endsAt) continue;
    busy.add(rule.roomId);
  }

  return ((rooms ?? []) as { id: string; name: string; capacity: number }[]).filter((r) => !busy.has(r.id));
}

/** Change la salle d'UNE séance datée, sans toucher aux autres semaines. */
export async function moveOccurrenceRoom(ctx: TenantContext, occurrenceId: string, roomId: string | null): Promise<void> {
  requireWritable(ctx, 'schedule.update');
  const supabase = await createClient();
  // La salle choisie doit être libre à ce moment-là : on ne crée pas un
  // chevauchement en corrigeant une fermeture.
  if (roomId) {
    const free = await freeRoomsForOccurrence(ctx, occurrenceId);
    if (!free.some((r) => r.id === roomId)) {
      throw new ValidationError('Cette salle n’est pas libre à ce moment-là (ou elle est fermée ce jour-là).');
    }
  }
  const { error, count } = await supabase
    .from('session_occurrences')
    .update({ override_room_id: roomId }, { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', occurrenceId);
  if (error) throw error;
  if (!count) throw new NotFoundError('Séance introuvable.');
  await audit(ctx, {
    action: 'schedule.occurrence_room',
    module: 'schedule',
    entityType: 'session_occurrence',
    entityId: occurrenceId,
    after: { room_id: roomId },
  });
}
