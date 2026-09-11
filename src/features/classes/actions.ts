'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { classSchema } from './schemas';
import { createClass, updateClass, deleteClass } from './service';

const withValues =
  (fd: FormData) =>
  (s: FormState): FormState =>
    s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s;

function parse(fd: FormData) {
  return classSchema.parse({
    levelId: fd.get('levelId'),
    code: fd.get('code'),
    name: fd.get('name'),
    capacity: fd.get('capacity') ?? 0,
    headTeacherId: fd.get('headTeacherId') ?? '',
  });
}

export async function createClassAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createClass(ctx, parse(fd));
    redirect(`/e/${slug}/classes?created=1`);
  }).then(withValues(fd));
}

export async function updateClassAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateClass(ctx, id, parse(fd));
    redirect(`/e/${slug}/classes?updated=1`);
  }).then(withValues(fd));
}

export async function deleteClassAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteClass(ctx, id);
    redirect(`/e/${slug}/classes?deleted=1`);
  });
}
