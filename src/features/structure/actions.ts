'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { cycleSchema, levelSchema } from './schemas';
import { createCycle, deleteCycle, createLevel, deleteLevel } from './service';

const withValues =
  (fd: FormData) =>
  (s: FormState): FormState =>
    s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s;

export async function createCycleAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createCycle(ctx, cycleSchema.parse({ code: fd.get('code'), name: fd.get('name'), sequence: fd.get('sequence') ?? 0 }));
    redirect(`/e/${slug}/structure?created=1`);
  }).then(withValues(fd));
}

export async function deleteCycleAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteCycle(ctx, id);
    redirect(`/e/${slug}/structure?deleted=1`);
  });
}

export async function createLevelAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createLevel(ctx, levelSchema.parse({
      cycleId: fd.get('cycleId'),
      code: fd.get('code'),
      name: fd.get('name'),
      sequence: fd.get('sequence') ?? 0,
    }));
    redirect(`/e/${slug}/structure?created=1`);
  }).then(withValues(fd));
}

export async function deleteLevelAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteLevel(ctx, id);
    redirect(`/e/${slug}/structure?deleted=1`);
  });
}
