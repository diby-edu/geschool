import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError } from '@/lib/errors';
import type { RoomInput, RoomTypeInput } from './schemas';

function toRow(input: RoomInput) {
  return {
    code: input.code,
    name: input.name,
    room_type_id: input.roomTypeId || null,
    capacity: input.capacity,
    building: input.building || null,
    floor: input.floor || null,
    is_accessible: input.isAccessible,
    is_active: input.isActive,
  };
}

export async function createRoom(ctx: TenantContext, input: RoomInput): Promise<string> {
  requireWritable(ctx, 'rooms.create');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rooms')
    .insert({ school_id: ctx.school.id, ...toRow(input) })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une salle porte deja ce code.');
    throw error;
  }
  await audit(ctx, { action: 'rooms.create', module: 'rooms', entityType: 'room', entityId: data.id, after: toRow(input) });
  return data.id;
}

export async function updateRoom(ctx: TenantContext, id: string, input: RoomInput): Promise<void> {
  requireWritable(ctx, 'rooms.update');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rooms')
    .update(toRow(input))
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une salle porte deja ce code.');
    throw error;
  }
  if (!data) throw new NotFoundError('Cette salle est introuvable.');
  await audit(ctx, { action: 'rooms.update', module: 'rooms', entityType: 'room', entityId: id, after: toRow(input) });
}

export async function deleteRoom(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'rooms.delete');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('rooms')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new ConflictError(
        'Cette salle est utilisee (emploi du temps ou affectation) et ne peut pas etre supprimee. Desactivez-la plutot.',
      );
    }
    throw error;
  }
  if (!count) throw new NotFoundError('Cette salle est introuvable.');
  await audit(ctx, { action: 'rooms.delete', module: 'rooms', entityType: 'room', entityId: id });
}

// --- Types de salle -------------------------------------------------------

export async function createRoomType(ctx: TenantContext, input: RoomTypeInput): Promise<void> {
  requireWritable(ctx, 'rooms.create');
  const supabase = await createClient();
  const { error } = await supabase
    .from('room_types')
    .insert({ school_id: ctx.school.id, code: input.code, name: input.name });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un type porte deja ce code.');
    throw error;
  }
  await audit(ctx, { action: 'rooms.type_create', module: 'rooms', entityType: 'room_type', after: input });
}

export async function deleteRoomType(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'rooms.delete');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('room_types')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Ce type est utilise par des salles.');
    throw error;
  }
  if (!count) throw new NotFoundError('Type introuvable.');
  await audit(ctx, { action: 'rooms.type_delete', module: 'rooms', entityType: 'room_type', entityId: id });
}
