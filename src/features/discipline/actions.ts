'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import {
  createIncidentType,
  createSanctionType,
  decideSanction,
  deleteIncident,
  deleteIncidentType,
  deleteSanctionType,
  reportIncident,
  setIncidentStatus,
  setSanctionStatus,
} from './service';

const withValues =
  (fd: FormData) =>
  (s: FormState): FormState =>
    s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s;

const incidentSchema = z.object({
  studentId: z.uuid('Élève requis.'),
  incidentTypeId: z.uuid('Motif requis.'),
  occurredOn: z.iso.date('Date invalide.'),
  occurredAt: z.string().trim().max(5).optional().or(z.literal('')),
  description: z.string().trim().max(2000).default(''),
});

const sanctionSchema = z.object({
  studentId: z.uuid('Élève requis.'),
  sanctionTypeId: z.uuid('Sanction requise.'),
  startsOn: z.string().trim().optional().or(z.literal('')),
  endsOn: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().max(2000).default(''),
});

const namedSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Code requis.')
    .max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  name: z.string().trim().min(1, 'Nom requis.').max(80),
});

export async function reportIncidentAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const input = incidentSchema.parse({
      studentId: fd.get('studentId'),
      incidentTypeId: fd.get('incidentTypeId'),
      occurredOn: fd.get('occurredOn'),
      occurredAt: fd.get('occurredAt') ?? '',
      description: fd.get('description') ?? '',
    });
    await reportIncident(ctx, { ...input, occurredAt: input.occurredAt ?? '' });
    redirect(`/e/${slug}/discipline?signale=1`);
  }).then(withValues(fd));
}

export async function setIncidentStatusAction(
  slug: string,
  id: string,
  status: 'OPEN' | 'CLOSED',
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await setIncidentStatus(ctx, id, status);
    redirect(`/e/${slug}/discipline?maj=1`);
  });
}

export async function deleteIncidentAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteIncident(ctx, id);
    redirect(`/e/${slug}/discipline?supprime=1`);
  });
}

export async function decideSanctionAction(
  slug: string,
  incidentId: string | null,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const input = sanctionSchema.parse({
      studentId: fd.get('studentId'),
      sanctionTypeId: fd.get('sanctionTypeId'),
      startsOn: fd.get('startsOn') ?? '',
      endsOn: fd.get('endsOn') ?? '',
      notes: fd.get('notes') ?? '',
    });
    await decideSanction(ctx, {
      incidentId,
      studentId: input.studentId,
      sanctionTypeId: input.sanctionTypeId,
      startsOn: input.startsOn ?? '',
      endsOn: input.endsOn ?? '',
      notes: input.notes,
    });
    redirect(`/e/${slug}/discipline?sanctionne=1`);
  }).then(withValues(fd));
}

export async function setSanctionStatusAction(
  slug: string,
  id: string,
  status: 'PLANNED' | 'DONE' | 'CANCELLED',
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await setSanctionStatus(ctx, id, status);
    redirect(`/e/${slug}/discipline?maj=1`);
  });
}

// --- Listes de l'établissement ----------------------------------------------

export async function createIncidentTypeAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const base = namedSchema.parse({ code: fd.get('code'), name: fd.get('name') });
    const points = Number(fd.get('points') ?? 0);
    await createIncidentType(ctx, { ...base, points: Number.isFinite(points) ? Math.max(0, Math.min(100, points)) : 0 });
    redirect(`/e/${slug}/discipline/config?created=1`);
  }).then(withValues(fd));
}

export async function createSanctionTypeAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const base = namedSchema.parse({ code: fd.get('code'), name: fd.get('name') });
    await createSanctionType(ctx, { ...base, needsDates: fd.get('needsDates') != null });
    redirect(`/e/${slug}/discipline/config?created=1`);
  }).then(withValues(fd));
}

export async function deleteIncidentTypeAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteIncidentType(ctx, id);
    redirect(`/e/${slug}/discipline/config?deleted=1`);
  });
}

export async function deleteSanctionTypeAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteSanctionType(ctx, id);
    redirect(`/e/${slug}/discipline/config?deleted=1`);
  });
}
