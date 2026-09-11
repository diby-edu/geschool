'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { assignmentSchema } from './schemas';
import { createAssignment, deleteAssignment } from './service';

export async function createAssignmentAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createAssignment(ctx, assignmentSchema.parse({
      teacherId: fd.get('teacherId'),
      subjectId: fd.get('subjectId'),
      classId: fd.get('classId'),
      weeklyMinutes: fd.get('weeklyMinutes') ?? 0,
    }));
    redirect(`/e/${slug}/assignments?created=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deleteAssignmentAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteAssignment(ctx, id);
    redirect(`/e/${slug}/assignments?deleted=1`);
  });
}
