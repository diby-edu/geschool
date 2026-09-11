import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { ListParams } from '@/lib/query/list';
import type { Tables } from '@/types/database';

export type RoomRow = {
  id: string;
  code: string;
  name: string;
  capacity: number;
  building: string | null;
  is_active: boolean;
  room_type_name: string | null;
};

export type RoomTypeRow = Pick<Tables<'room_types'>, 'id' | 'code' | 'name'>;

export const ROOM_SORTABLE = ['code', 'name', 'capacity'] as const;

export async function listRooms(
  ctx: TenantContext,
  params: ListParams,
): Promise<{ rows: RoomRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from('rooms')
    .select('id, code, name, capacity, building, is_active, room_types(name)', { count: 'exact' })
    .eq('school_id', ctx.school.id);

  if (params.q) query = query.or(`name.ilike.%${params.q}%,code.ilike.%${params.q}%`);

  const sort = params.sort && (ROOM_SORTABLE as readonly string[]).includes(params.sort)
    ? params.sort
    : 'code';
  query = query.order(sort, { ascending: params.dir === 'asc' }).range(params.from, params.to);

  const { data, count, error } = await query;
  if (error) throw error;

  const rows: RoomRow[] = ((data ?? []) as unknown as (Omit<RoomRow, 'room_type_name'> & {
    room_types: { name: string } | null;
  })[]).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    capacity: r.capacity,
    building: r.building,
    is_active: r.is_active,
    room_type_name: r.room_types?.name ?? null,
  }));

  return { rows, total: count ?? 0 };
}

export async function getRoom(ctx: TenantContext, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('rooms')
    .select('id, code, name, capacity, building, floor, is_accessible, is_active, room_type_id')
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function listRoomTypes(ctx: TenantContext): Promise<RoomTypeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('room_types')
    .select('id, code, name')
    .eq('school_id', ctx.school.id)
    .order('name');
  return (data ?? []) as RoomTypeRow[];
}
