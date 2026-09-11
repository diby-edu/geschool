'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { roomSchema, roomTypeSchema } from './schemas';
import { createRoom, updateRoom, deleteRoom, createRoomType, deleteRoomType } from './service';

function parse(formData: FormData) {
  return roomSchema.parse({
    code: formData.get('code'),
    name: formData.get('name'),
    roomTypeId: formData.get('roomTypeId') ?? '',
    capacity: formData.get('capacity'),
    building: formData.get('building') ?? '',
    floor: formData.get('floor') ?? '',
    isAccessible: formData.get('isAccessible') != null,
    isActive: formData.get('isActive') != null,
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
    await createRoomType(ctx, roomTypeSchema.parse({ code: formData.get('code'), name: formData.get('name') }));
    redirect(`/e/${slug}/rooms/types?created=1`);
  }).then(withValues(formData));
}

export async function deleteRoomTypeAction(slug: string, id: string, _p: FormState, _f: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteRoomType(ctx, id);
    redirect(`/e/${slug}/rooms/types?deleted=1`);
  });
}
