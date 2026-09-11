'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { levelSubjectSchema } from './schemas';
import { upsertLevelSubject, removeLevelSubject } from './service';

export async function upsertLevelSubjectAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const input = levelSubjectSchema.parse({
      levelId: fd.get('levelId'),
      subjectId: fd.get('subjectId'),
      coefficient: fd.get('coefficient'),
      weeklyMinutes: fd.get('weeklyMinutes') ?? 0,
      isMandatory: fd.get('isMandatory') != null,
    });
    await upsertLevelSubject(ctx, input);
    redirect(`/e/${slug}/programme?level=${input.levelId}&updated=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function removeLevelSubjectAction(
  slug: string,
  levelId: string,
  id: string,
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await removeLevelSubject(ctx, id);
    redirect(`/e/${slug}/programme?level=${levelId}&deleted=1`);
  });
}
