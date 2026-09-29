'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { roomSchema, roomTypeSchema } from './schemas';
import {
  createRoom,
  updateRoom,
  deleteRoom,
  createRoomType,
  updateRoomTypeTracks,
  deleteRoomType,
  createRoomFeature,
  deleteRoomFeature,
  createRooms,
} from './service';

const TRACKS = ['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'] as const;
type Track = (typeof TRACKS)[number];

/** Les ordres arrivent en une seule valeur « GENERAL,TECHNIQUE ». */
function readTracks(raw: FormDataEntryValue | null): Track[] {
  return String(raw ?? '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter((v): v is Track => (TRACKS as readonly string[]).includes(v));
}

function parse(formData: FormData) {
  return roomSchema.parse({
    code: formData.get('code'),
    name: formData.get('name'),
    roomTypeId: formData.get('roomTypeId') ?? '',
    tracks: readTracks(formData.get('tracks')),
    capacity: formData.get('capacity'),
    building: formData.get('building') ?? '',
    floor: formData.get('floor') ?? '',
    isActive: formData.get('isActive') != null,
    features: formData.getAll('features').map(String),
  });
}

const withValues =
  (formData: FormData) =>
  (state: FormState): FormState =>
    state.error || state.fieldErrors ? { ...state, values: formValues(formData) } : state;

export async function createRoomAction(slug: string, _p: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createRoom(ctx, parse(formData));
    redirect(`/e/${slug}/rooms?created=1`);
  }).then(withValues(formData));
}

export async function updateRoomAction(slug: string, id: string, _p: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateRoom(ctx, id, parse(formData));
    redirect(`/e/${slug}/rooms?updated=1`);
  }).then(withValues(formData));
}

export async function deleteRoomAction(slug: string, id: string, _p: FormState, _f: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteRoom(ctx, id);
    redirect(`/e/${slug}/rooms?deleted=1`);
  });
}

export async function createRoomTypeAction(slug: string, _p: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createRoomType(
      ctx,
      roomTypeSchema.parse({
        code: formData.get('code'),
        name: formData.get('name'),
        tracks: formData.getAll('tracks').map(String),
      }),
    );
    redirect(`/e/${slug}/rooms/types?created=1`);
  }).then(withValues(formData));
}

/** Change les ordres d'enseignement d'un type existant. */
export async function updateRoomTypeTracksAction(
  slug: string,
  id: string,
  _p: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateRoomTypeTracks(ctx, id, formData.getAll('tracks').map(String).filter(isTrack));
    redirect(`/e/${slug}/rooms/types?updated=1`);
  });
}

const isTrack = (v: string): v is Track => (TRACKS as readonly string[]).includes(v);

export async function deleteRoomTypeAction(slug: string, id: string, _p: FormState, _f: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteRoomType(ctx, id);
    redirect(`/e/${slug}/rooms/types?deleted=1`);
  });
}

export async function createRoomFeatureAction(slug: string, _p: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createRoomFeature(ctx, roomTypeSchema.parse({ code: formData.get('code'), name: formData.get('name') }));
    redirect(`/e/${slug}/rooms/types?created=1`);
  }).then(withValues(formData));
}

export async function deleteRoomFeatureAction(slug: string, id: string, _p: FormState, _f: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteRoomFeature(ctx, id);
    redirect(`/e/${slug}/rooms/types?deleted=1`);
  });
}

/** Création d'une salle ou d'une série depuis l'écran « Nouvelle salle ». */
export async function createRoomsAction(slug: string, _p: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const num = (key: string, fallback: number) => {
      const n = Number(formData.get(key) ?? fallback);
      return Number.isFinite(n) ? n : fallback;
    };
    const n = await createRooms(ctx, {
      baseName: String(formData.get('baseName') ?? ''),
      mode: String(formData.get('mode') ?? 'ONE') === 'MANY' ? 'MANY' : 'ONE',
      count: Math.max(1, Math.min(100, num('count', 1))),
      numbering: String(formData.get('numbering') ?? 'DIGITS') === 'LETTERS' ? 'LETTERS' : 'DIGITS',
      startAt: Math.max(1, num('startAt', 1)),
      capacity: Math.max(0, Math.min(2000, num('capacity', 0))),
      roomTypeId: String(formData.get('roomTypeId') ?? ''),
      newTypeName: String(formData.get('newTypeName') ?? ''),
      newTypeTracks: readTracks(formData.get('newTypeTracks')),
      tracks: readTracks(formData.get('tracks')),
      building: String(formData.get('building') ?? '').trim(),
      floor: String(formData.get('floor') ?? '').trim(),
      features: formData.getAll('features').map(String),
    });
    redirect(`/e/${slug}/rooms?creees=${n}`);
  }).then(withValues(formData));
}
