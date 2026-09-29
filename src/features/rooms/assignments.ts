import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { readSettings } from '@/features/settings/school-settings';
import { loadValidatorSessions } from '@/features/schedule/sessions';
import { checkCapacity, readRoomPolicy, type RoomPolicy } from './policy';

/**
 * Affectation d'une salle à une classe — la « salle habituelle ».
 *
 * Ce n'est qu'un défaut : un cours peut exiger le laboratoire, une séance isolée
 * peut se tenir ailleurs, et une école en rotation n'affecte rien du tout. Le
 * comportement suit le réglage de l'établissement (`policy.ts`).
 */

export type AssignmentRow = {
  classId: string;
  className: string;
  classCode: string;
  levelName: string;
  track: string;
  capacity: number;
  enrolled: number;
  roomId: string | null;
  roomName: string | null;
  roomCapacity: number | null;
};

export type RoomOption = { id: string; code: string; name: string; capacity: number };

export async function getRoomPolicy(ctx: TenantContext): Promise<RoomPolicy> {
  return readRoomPolicy(await readSettings(ctx, 'schedule'));
}

/** Les classes de l'année en cours, avec leur effectif réel et leur salle. */
export async function listAssignments(ctx: TenantContext): Promise<AssignmentRow[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();

  const [{ data: classes }, { data: levels }, { data: cycles }, { data: rooms }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, code, name, capacity, level_id, main_room_id, student_enrollments(count)')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('status', 'ACTIVE')
      .order('code'),
    supabase.from('levels').select('id, name, cycle_id, sequence').eq('school_id', ctx.school.id),
    supabase.from('cycles').select('id, track').eq('school_id', ctx.school.id),
    supabase.from('rooms').select('id, name, capacity').eq('school_id', ctx.school.id),
  ]);

  const levelById = new Map((levels ?? []).map((l) => [l.id, l]));
  const trackByCycle = new Map((cycles ?? []).map((c) => [c.id, (c.track ?? 'GENERAL') as string]));
  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));

  type Raw = {
    id: string;
    code: string;
    name: string;
    capacity: number;
    level_id: string;
    main_room_id: string | null;
    student_enrollments: { count: number }[];
  };

  return ((classes ?? []) as unknown as Raw[]).map((c) => {
    const level = levelById.get(c.level_id);
    const room = c.main_room_id ? roomById.get(c.main_room_id) : undefined;
    return {
      classId: c.id,
      className: c.name,
      classCode: c.code,
      levelName: level?.name ?? '—',
      track: level ? (trackByCycle.get(level.cycle_id) ?? 'GENERAL') : 'GENERAL',
      capacity: c.capacity,
      enrolled: c.student_enrollments?.[0]?.count ?? 0,
      roomId: c.main_room_id,
      roomName: room?.name ?? null,
      roomCapacity: room?.capacity ?? null,
    };
  });
}

export async function listRoomOptions(ctx: TenantContext): Promise<RoomOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('rooms')
    .select('id, code, name, capacity')
    .eq('school_id', ctx.school.id)
    .eq('is_active', true)
    .order('code');
  return (data ?? []) as RoomOption[];
}

export type AssignResult = { moved: number; skipped: number; warning: string | null };

/**
 * Donne (ou retire) la salle habituelle d'une classe, puis reporte le changement
 * sur ses cours À VENIR : ceux qui se tenaient dans l'ancienne salle, ou qui
 * n'en avaient aucune. Un cours qui exige une autre salle (laboratoire, atelier)
 * n'est jamais touché, et un cours qui créerait une double occupation est laissé
 * en place et compté à part.
 */
export async function assignRoom(ctx: TenantContext, classId: string, roomId: string | null): Promise<AssignResult> {
  requireWritable(ctx, 'classes.update');
  const supabase = await createClient();
  const policy = await getRoomPolicy(ctx);

  const { data } = await supabase
    .from('classes')
    .select('id, name, capacity, main_room_id, student_enrollments(count)')
    .eq('school_id', ctx.school.id)
    .eq('id', classId)
    .maybeSingle();
  if (!data) throw new NotFoundError('Classe introuvable.');
  const klass = data as unknown as {
    capacity: number;
    main_room_id: string | null;
    student_enrollments: { count: number }[];
  };

  const previousRoomId = klass.main_room_id;
  const enrolled = klass.student_enrollments?.[0]?.count ?? 0;
  const students = Math.max(enrolled, 0) || klass.capacity;

  let warning: string | null = null;
  if (roomId) {
    const { data: room } = await supabase
      .from('rooms')
      .select('id, name, capacity, is_active')
      .eq('school_id', ctx.school.id)
      .eq('id', roomId)
      .maybeSingle();
    if (!room) throw new NotFoundError('Salle introuvable.');
    if (!room.is_active) throw new ValidationError(`« ${room.name} » est désactivée : réactivez-la d'abord.`);
    const check = checkCapacity(policy, students, room.capacity, room.name);
    if (!check.ok) throw new ValidationError(check.message ?? 'Salle trop petite.');
    warning = check.message;
  }

  const { error } = await supabase
    .from('classes')
    .update({ main_room_id: roomId })
    .eq('school_id', ctx.school.id)
    .eq('id', classId);
  if (error) throw error;

  const report = roomId ? await applyToFutureSessions(ctx, classId, previousRoomId, roomId) : { moved: 0, skipped: 0 };

  await audit(ctx, {
    action: 'classes.assign_room',
    module: 'classes',
    entityType: 'class',
    entityId: classId,
    after: { room_id: roomId, ...report },
  });
  return { ...report, warning };
}

/** Reporte la nouvelle salle sur les cours de la classe, sans créer de chevauchement. */
async function applyToFutureSessions(
  ctx: TenantContext,
  classId: string,
  previousRoomId: string | null,
  roomId: string,
): Promise<{ moved: number; skipped: number }> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return { moved: 0, skipped: 0 };
  const supabase = await createClient();

  const { data: version } = await supabase
    .from('schedule_versions')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'PUBLISHED')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!version) return { moved: 0, skipped: 0 };

  const sessions = await loadValidatorSessions(ctx, version.id);
  const mine = sessions.filter(
    (s) =>
      s.classIds.includes(classId) &&
      (s.roomIds.length === 0 || (previousRoomId !== null && s.roomIds.includes(previousRoomId))) &&
      !s.roomIds.includes(roomId),
  );

  // Occupation de la salle visée, mise à jour au fur et à mesure des déplacements.
  const busy = sessions.filter((s) => s.roomIds.includes(roomId) && !mine.some((m) => m.id === s.id));
  let moved = 0;
  let skipped = 0;

  for (const s of mine) {
    const clash = busy.some((b) => b.dayOfWeek === s.dayOfWeek && b.startMin < s.endMin && s.startMin < b.endMin);
    if (clash) {
      skipped++;
      continue;
    }
    if (previousRoomId) {
      await supabase
        .from('schedule_session_rooms')
        .delete()
        .eq('school_id', ctx.school.id)
        .eq('session_id', s.id)
        .eq('room_id', previousRoomId);
    }
    const { error } = await supabase
      .from('schedule_session_rooms')
      .upsert(
        { school_id: ctx.school.id, session_id: s.id, room_id: roomId, is_primary: true },
        { onConflict: 'session_id,room_id' },
      );
    if (error) throw error;
    busy.push({ ...s, roomIds: [roomId] });
    moved++;
  }
  return { moved, skipped };
}
