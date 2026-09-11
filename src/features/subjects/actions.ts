'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { subjectSchema } from './schemas';
import { createSubject, updateSubject, deleteSubject } from './service';

function parse(formData: FormData) {
  return subjectSchema.parse({
    code: formData.get('code'),
    name: formData.get('name'),
    shortName: formData.get('shortName') ?? '',
    category: formData.get('category') ?? '',
    color: formData.get('color') ?? '',
    defaultCoefficient: formData.get('defaultCoefficient'),
    // Case a cocher : absente = decochee = false
    isActive: formData.get('isActive') != null,
  });
}

export async function createSubjectAction(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const input = parse(formData);
    await createSubject(ctx, input);
    redirect(`/e/${slug}/subjects?created=1`);
  }).then((state) => (state.error || state.fieldErrors ? { ...state, values: formValues(formData) } : state));
}

export async function updateSubjectAction(
  slug: string,
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const input = parse(formData);
    await updateSubject(ctx, id, input);
    redirect(`/e/${slug}/subjects?updated=1`);
  }).then((state) => (state.error || state.fieldErrors ? { ...state, values: formValues(formData) } : state));
}

export async function deleteSubjectAction(
  slug: string,
  id: string,
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteSubject(ctx, id);
    redirect(`/e/${slug}/subjects?deleted=1`);
  });
}
