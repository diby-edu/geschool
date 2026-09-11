'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { teacherSchema } from './schemas';
import { createTeacher, updateTeacher, archiveTeacher } from './service';

const withValues =
  (fd: FormData) =>
  (s: FormState): FormState =>
    s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s;

function parse(fd: FormData) {
  return teacherSchema.parse({
    staffNumber: fd.get('staffNumber'),
    firstName: fd.get('firstName'),
    lastName: fd.get('lastName'),
    gender: fd.get('gender') ?? '',
    phone: fd.get('phone') ?? '',
    email: fd.get('email') ?? '',
    specialty: fd.get('specialty') ?? '',
    employmentType: fd.get('employmentType') ?? 'PERMANENT',
    status: fd.get('status') ?? 'ACTIVE',
  });
}

export async function createTeacherAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createTeacher(ctx, parse(fd));
    redirect(`/e/${slug}/teachers?created=1`);
  }).then(withValues(fd));
}

export async function updateTeacherAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateTeacher(ctx, id, parse(fd));
    redirect(`/e/${slug}/teachers?updated=1`);
  }).then(withValues(fd));
}

export async function archiveTeacherAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await archiveTeacher(ctx, id);
    redirect(`/e/${slug}/teachers?deleted=1`);
  });
}
