'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { academicYearSchema, calendarEventSchema, periodEditSchema, periodSchema } from './schemas';
import { nameFromStart } from './school-year';
import {
  createYear, updateYear, activateYear, closeYear, reopenYear, createPeriod, deletePeriod, setGradingWindow, setGradingOverride,
  createCalendarEvent, deleteCalendarEvent, applyOfficialCalendar, updatePeriod, updateCalendarEvent,
} from './service';

const withValues =
  (formData: FormData) =>
  (state: FormState): FormState =>
    state.error || state.fieldErrors ? { ...state, values: formValues(formData) } : state;

/**
 * Le nom de l'annee se DEDUIT de sa date de debut : « 2026-2027 ».
 *
 * Le demander, c'etait demander de recopier ce que la date dit deja — et
 * s'exposer a « 2026/2027 », « 2026 - 2027 » et « Annee 2026 » dans la meme
 * base. Un nom explicite reste accepte pour les cas particuliers.
 */
function parseYear(fd: FormData) {
  const startsOn = String(fd.get('startsOn') ?? '');
  const saisi = String(fd.get('name') ?? '').trim();
  return academicYearSchema.parse({
    name: saisi || nameFromStart(startsOn) || '',
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
    // L'annee courante s'affiche dans le menu (layout) : il faut le reconstruire.
    revalidatePath(`/e/${slug}`, 'layout');
    redirect(`/e/${slug}/academic-years?updated=1`);
  });
}

export async function closeYearAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await closeYear(ctx, id);
    // L'annee courante s'affiche dans le menu (layout) : il faut le reconstruire.
    revalidatePath(`/e/${slug}`, 'layout');
    redirect(`/e/${slug}/academic-years?updated=1`);
  });
}

export async function reopenYearAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await reopenYear(ctx, id);
    // L'annee courante s'affiche dans le menu (layout) : il faut le reconstruire.
    revalidatePath(`/e/${slug}`, 'layout');
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
      track: fd.get('track') ?? '',
    }));
    redirect(`/e/${slug}/academic-years/${yearId}?onglet=trimestres&created=1`);
  }).then(withValues(fd));
}

export async function deletePeriodAction(slug: string, yearId: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deletePeriod(ctx, id);
    redirect(`/e/${slug}/academic-years/${yearId}?onglet=trimestres&deleted=1`);
  });
}

const dateOrNull = (v: FormDataEntryValue | null): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** Dates de la periode de calcul des moyennes (fiche de l'annee). */
export async function setGradingWindowAction(slug: string, yearId: string, periodId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await setGradingWindow(ctx, periodId, dateOrNull(fd.get('gradingStarts')), dateOrNull(fd.get('gradingEnds')));
    redirect(`/e/${slug}/academic-years/${yearId}?onglet=trimestres&updated=1`);
  }).then(withValues(fd));
}

/**
 * Ouvrir / fermer / remettre en automatique la periode de calcul. `back` : « dashboard »
 * (bouton du bloc Moyennes et bulletins) ou l'identifiant de l'annee (sa fiche).
 */
export async function setGradingOverrideAction(slug: string, periodId: string, mode: string, back: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const value = mode === 'OPEN' ? 'OPEN' : mode === 'CLOSED' ? 'CLOSED' : null;
    await setGradingOverride(ctx, periodId, value);
    redirect(back === 'dashboard' ? `/e/${slug}/dashboard` : `/e/${slug}/academic-years/${back}?updated=1`);
  });
}

export async function createCalendarEventAction(slug: string, yearId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createCalendarEvent(ctx, yearId, calendarEventSchema.parse({
      name: fd.get('name'),
      kind: fd.get('kind') ?? 'VACATION',
      startsOn: fd.get('startsOn'),
      endsOn: fd.get('endsOn'),
      blocksSchedule: fd.get('blocksSchedule') != null,
    }));
    redirect(`/e/${slug}/academic-years/${yearId}?onglet=conges&created=1`);
  }).then(withValues(fd));
}

export async function deleteCalendarEventAction(slug: string, yearId: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteCalendarEvent(ctx, id);
    redirect(`/e/${slug}/academic-years/${yearId}?onglet=conges&deleted=1`);
  });
}

/** Trimestres et congés officiels ; ils alimentent notes et tableaux de bord : tout l'espace se relit. */
export async function applyOfficialCalendarAction(slug: string, yearId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const r = await applyOfficialCalendar(ctx, yearId);
    revalidatePath(`/e/${slug}`, 'layout');
    redirect(`/e/${slug}/academic-years/${yearId}?onglet=trimestres&official=${r.periodsCreated + r.periodsUpdated}-${r.breaksCreated + r.breaksUpdated}`);
  });
}

export async function updatePeriodAction(slug: string, yearId: string, periodId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updatePeriod(ctx, periodId, periodEditSchema.parse({
      name: fd.get('name'),
      kind: fd.get('kind') ?? 'TERM',
      startsOn: fd.get('startsOn'),
      endsOn: fd.get('endsOn'),
      isGradingPeriod: fd.get('isGradingPeriod') != null,
      track: fd.get('track') ?? '',
    }));
    // Les dates des trimestres alimentent notes et tableaux de bord.
    revalidatePath(`/e/${slug}`, 'layout');
    redirect(`/e/${slug}/academic-years/${yearId}?updated=1`);
  }).then(withValues(fd));
}

export async function updateCalendarEventAction(slug: string, yearId: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateCalendarEvent(ctx, id, calendarEventSchema.parse({
      name: fd.get('name'),
      kind: fd.get('kind') ?? 'VACATION',
      startsOn: fd.get('startsOn'),
      endsOn: fd.get('endsOn'),
      blocksSchedule: fd.get('blocksSchedule') != null,
    }));
    redirect(`/e/${slug}/academic-years/${yearId}?onglet=conges&updated=1`);
  }).then(withValues(fd));
}
