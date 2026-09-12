'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { scheduleConfigSchema, sessionSchema } from './schemas';
import { saveConfig } from './config';
import { createVersion, publishVersion, deleteVersion } from './versions';
import { addSession, deleteSession } from './sessions';

export async function saveConfigAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await saveConfig(ctx, scheduleConfigSchema.parse({
      workingDays: fd.getAll('workingDays'),
      dayStart: fd.get('dayStart'),
      dayEnd: fd.get('dayEnd'),
      slotMinutes: fd.get('slotMinutes'),
    }));
    redirect(`/e/${slug}/schedule?configured=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function createVersionAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const id = await createVersion(ctx);
    redirect(`/e/${slug}/schedule/${id}`);
  });
}

export async function publishVersionAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await publishVersion(ctx, id);
    redirect(`/e/${slug}/schedule/${id}?published=1`);
  });
}

export async function deleteVersionAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteVersion(ctx, id);
    redirect(`/e/${slug}/schedule?deleted=1`);
  });
}

export async function addSessionAction(slug: string, versionId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await addSession(ctx, versionId, sessionSchema.parse({
      startSlotId: fd.get('startSlotId'),
      endSlotId: fd.get('endSlotId'),
      subjectId: fd.get('subjectId'),
      teacherId: fd.get('teacherId') ?? '',
      classId: fd.get('classId'),
      roomId: fd.get('roomId') ?? '',
    }));
    redirect(`/e/${slug}/schedule/${versionId}?added=1&class=${fd.get('classId')}`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deleteSessionAction(slug: string, versionId: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteSession(ctx, id);
    redirect(`/e/${slug}/schedule/${versionId}?removed=1`);
  });
}
