import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { RoomInput, RoomTypeInput } from './schemas';
import { planRooms } from './naming';
import { suggestCode } from '@/lib/text/code';
import { schoolTracks } from '@/features/structure/queries';
import type { EducationTrack } from '@/features/structure/official-tracks';

function toRow(input: RoomInput) {
  return {
    code: input.code,
    name: input.name,
    room_type_id: input.roomTypeId || null,
    capacity: input.capacity,
    building: input.building || null,
    floor: input.floor || null,
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
    if (error.code === '23505') throw new ConflictError('Une salle porte déjà ce code.');
    throw error;
  }
  await setRoomFeatures(ctx, data.id, input.features);
  await audit(ctx, { action: 'rooms.create', module: 'rooms', entityType: 'room', entityId: data.id, after: toRow(input) });
  return data.id;
}

export async function updateRoom(ctx: TenantContext, id: string, input: RoomInput): Promise<void> {
  requireWritable(ctx, 'rooms.update');
  const supabase = await createClient();
  const tracks = await keepSchoolTracks(ctx, input.tracks);
  const { data, error } = await supabase
    .from('rooms')
    .update({ ...toRow(input), tracks })
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une salle porte déjà ce code.');
    throw error;
  }
  if (!data) throw new NotFoundError('Cette salle est introuvable.');
  await setRoomFeatures(ctx, id, input.features);
  await audit(ctx, {
    action: 'rooms.update',
    module: 'rooms',
    entityType: 'room',
    entityId: id,
    after: { ...toRow(input), tracks },
  });
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
        'Cette salle est utilisée (emploi du temps ou affectation) et ne peut pas être supprimée. Desactivez-la plutôt.',
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
  const tracks = await keepSchoolTracks(ctx, input.tracks);
  const { error } = await supabase
    .from('room_types')
    .insert({ school_id: ctx.school.id, code: input.code, name: input.name, tracks });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un type porte déjà ce code.');
    throw error;
  }
  await audit(ctx, { action: 'rooms.type_create', module: 'rooms', entityType: 'room_type', after: { ...input, tracks } });
}

/**
 * Change les ordres d'enseignement d'un type de salle.
 *
 * Restreindre un type ne touche pas aux salles déjà créées : elles gardent les
 * ordres qu'on leur a donnés. Le type ne fait que proposer un défaut.
 */
export async function updateRoomTypeTracks(
  ctx: TenantContext,
  id: string,
  wanted: EducationTrack[],
): Promise<void> {
  requireWritable(ctx, 'rooms.update');
  const supabase = await createClient();
  const tracks = await keepSchoolTracks(ctx, wanted);
  const { error, count } = await supabase
    .from('room_types')
    .update({ tracks }, { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Type introuvable.');
  await audit(ctx, {
    action: 'rooms.type_tracks',
    module: 'rooms',
    entityType: 'room_type',
    entityId: id,
    after: { tracks },
  });
}

/**
 * Ne garde que les ordres que l'établissement a choisis à son inscription, et
 * jamais une liste vide — la base la refuse, et elle ne voudrait rien dire.
 */
async function keepSchoolTracks(ctx: TenantContext, wanted: EducationTrack[]): Promise<EducationTrack[]> {
  const known = await schoolTracks(ctx);
  const kept = wanted.filter((t) => known.includes(t));
  return kept.length > 0 ? kept : known;
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
    if (error.code === '23503') throw new ConflictError('Ce type est utilisé par des salles.');
    throw error;
  }
  if (!count) throw new NotFoundError('Type introuvable.');
  await audit(ctx, { action: 'rooms.type_delete', module: 'rooms', entityType: 'room_type', entityId: id });
}

/** Équipement : créé librement par l'établissement, comme les types de salle. */
export async function createRoomFeature(ctx: TenantContext, input: RoomTypeInput): Promise<void> {
  requireWritable(ctx, 'rooms.create');
  const supabase = await createClient();
  const { error } = await supabase
    .from('room_features')
    .insert({ school_id: ctx.school.id, code: input.code, name: input.name });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un équipement porte déjà ce code.');
    throw error;
  }
  await audit(ctx, { action: 'rooms.feature_create', module: 'rooms', entityType: 'room_feature', after: input });
}

export async function deleteRoomFeature(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'rooms.delete');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('room_features')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Équipement introuvable.');
  await audit(ctx, { action: 'rooms.feature_delete', module: 'rooms', entityType: 'room_feature', entityId: id });
}

/** Les équipements présents dans une salle : on remplace la liste entière. */
export async function setRoomFeatures(ctx: TenantContext, roomId: string, featureIds: string[]): Promise<void> {
  requireWritable(ctx, 'rooms.update');
  const supabase = await createClient();
  await supabase.from('room_room_features').delete().eq('school_id', ctx.school.id).eq('room_id', roomId);
  if (featureIds.length === 0) return;
  const { error } = await supabase
    .from('room_room_features')
    .insert(featureIds.map((feature_id) => ({ school_id: ctx.school.id, room_id: roomId, feature_id })));
  if (error) throw error;
}

export type RoomBatchInput = {
  baseName: string;
  mode: 'ONE' | 'MANY';
  count: number;
  numbering: 'DIGITS' | 'LETTERS';
  startAt: number;
  capacity: number;
  roomTypeId: string;
  /** Type choisi dans les suggestions ou saisi librement : créé à l'enregistrement. */
  newTypeName: string;
  /** Ordres du type à créer. Vide = tous ceux de l'établissement. */
  newTypeTracks: EducationTrack[];
  /** Ordres servis par les salles créées. Vide = tous ceux de l'établissement. */
  tracks: EducationTrack[];
  building: string;
  floor: string;
  features: string[];
};

/**
 * Crée une salle, ou toute une série (« Salle 1 » à « Salle 10 »).
 *
 * Le code n'est plus saisi : il se déduit du nom, comme pour les niveaux et les
 * classes. Une seule insertion : ou tout passe, ou rien n'est créé.
 */
export async function createRooms(ctx: TenantContext, input: RoomBatchInput): Promise<number> {
  requireWritable(ctx, 'rooms.create');
  const supabase = await createClient();

  const plan = planRooms({
    baseName: input.baseName,
    mode: input.mode,
    count: input.count,
    numbering: input.numbering,
    startAt: input.startAt,
  });
  if (plan.length === 0) throw new ValidationError('Indiquez le nom de la salle.');

  // Les ordres de l'établissement bornent tout le reste : on n'enregistre jamais
  // un ordre que l'école n'a pas choisi à son inscription.
  const known = await schoolTracks(ctx);
  const keep = (list: EducationTrack[]) => {
    const kept = list.filter((t) => known.includes(t));
    return kept.length > 0 ? kept : known;
  };
  const tracks = keep(input.tracks);

  // Type choisi dans les suggestions : on le crée d'abord, pour que la série en hérite.
  let roomTypeId = input.roomTypeId || null;
  const newType = input.newTypeName.trim();
  if (!roomTypeId && newType) {
    const code = suggestCode(newType);
    const { data: existing } = await supabase
      .from('room_types')
      .select('id')
      .eq('school_id', ctx.school.id)
      .eq('code', code)
      .maybeSingle();
    if (existing) roomTypeId = existing.id;
    else {
      const { data, error } = await supabase
        .from('room_types')
        .insert({ school_id: ctx.school.id, code, name: newType, tracks: keep(input.newTypeTracks) })
        .select('id')
        .single();
      if (error) throw error;
      roomTypeId = data.id;
    }
  }
  if (!roomTypeId) throw new ValidationError('Choisissez un type de salle.');

  const { data: taken } = await supabase
    .from('rooms')
    .select('code')
    .eq('school_id', ctx.school.id)
    .in('code', plan.map((r) => r.code));
  const clash = ((taken ?? []) as { code: string }[]).map((r) => r.code);
  if (clash.length > 0) {
    throw new ConflictError(
      clash.length === 1
        ? `La salle « ${clash[0]} » existe déjà.`
        : `Ces salles existent déjà : ${clash.join(', ')}.`,
    );
  }

  const { data: created, error } = await supabase
    .from('rooms')
    .insert(
      plan.map((r) => ({
        school_id: ctx.school.id,
        code: r.code,
        name: r.name,
        room_type_id: roomTypeId,
        capacity: input.capacity,
        building: input.building || null,
        floor: input.floor || null,
        tracks,
        is_active: true,
      })),
    )
    .select('id');
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une salle porte déjà ce code.');
    throw error;
  }

  if (input.features.length > 0) {
    for (const room of (created ?? []) as { id: string }[]) {
      await setRoomFeatures(ctx, room.id, input.features);
    }
  }

  await audit(ctx, {
    action: 'rooms.create_batch',
    module: 'rooms',
    entityType: 'room',
    after: { created: plan.map((r) => r.code) },
  });
  return plan.length;
}
