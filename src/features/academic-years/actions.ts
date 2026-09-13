'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { academicYearSchema, periodSchema } from './schemas';
import {
  createYear, updateYear, activateYear, closeYear, reopenYear, createPeriod, deletePeriod,
} from './service';

const withValues =
  (formData: FormData) =>
  (state: FormState): FormState =>
    state.error || state.fieldErrors ? { ...state, values: formValues(formData) } : state;

function parseYear(fd: FormData) {
  return academicYearSchema.parse({
    name: fd.get('name'),
    startsOn: fd.get('startsOn'),
    endsOn: fd.get('endsOn'),
  });
}

export async function createYearAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const id = await createYear(ctx, parseYear(fd));
    // Direction directe vers la fiche de l'annee : creer une annee sans
    // enchainer sur ses periodes et ses horaires ne servirait a rien (les
    // deux sont obligatoires avant de generer un emploi du temps).
    redirect(`/e/${slug}/academic-years/${id}?created=1`);
  }).then(withValues(fd));
}

export async function updateYearAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateYear(ctx, id, parseYear(fd));
    redirect(`/e/${slug}/academic-years/${id}?updated=1`);
  }).then(withValues(fd));
}

export async function activateYearAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await activateYear(ctx, id);
    redirect(`/e/${slug}/academic-years?updated=1`);
  });
}

export async function closeYearAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await closeYear(ctx, id);
    redirect(`/e/${slug}/academic-years?updated=1`);
  });
}

export async function reopenYearAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await reopenYear(ctx, id);
    redirect(`/e/${slug}/academic-years?updated=1`);
  });
}

export async function createPeriodAction(slug: string, yearId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createPeriod(ctx, yearId, periodSchema.parse({
      name: fd.get('name'),
      sequence: fd.get('sequence'),
      kind: fd.get('kind'),
      startsOn: fd.get('startsOn'),
      endsOn: fd.get('endsOn'),
      isGradingPeriod: fd.get('isGradingPeriod') != null,
    }));
    redirect(`/e/${slug}/academic-years/${yearId}?created=1`);
  }).then(withValues(fd));
}

export async function deletePeriodAction(slug: string, yearId: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deletePeriod(ctx, id);
    redirect(`/e/${slug}/academic-years/${yearId}?deleted=1`);
  });
}
