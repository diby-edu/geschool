'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { teacherSchema } from './schemas';
import { createTeacher, updateTeacher, archiveTeacher } from './service';
import { createTeacherAccess, createMissingTeacherAccesses } from '@/services/teacher-access';
import { writeServiceDefaults } from './service-defaults';
import { EMPLOYMENT_TYPES, type ServiceDefaults } from './service-types';

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
    birthDate: fd.get('birthDate') ?? '',
    phone: fd.get('phone') ?? '',
    email: fd.get('email') ?? '',
    address: fd.get('address') ?? '',
    specialty: fd.get('specialty') ?? '',
    employmentType: fd.get('employmentType') ?? undefined,
    status: fd.get('status') ?? 'ACTIVE',
    hireDate: fd.get('hireDate') ?? '',
    diploma: fd.get('diploma') ?? '',
    diplomaDetail: fd.get('diplomaDetail') ?? '',
    minSessions: fd.get('minSessions') ?? '',
    maxSessions: fd.get('maxSessions') ?? '',
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

/** Cree l'acces de connexion d'un enseignant depuis sa fiche (« Creer l'acces »). */
export async function createTeacherAccessAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const r = await createTeacherAccess(ctx, id);
    const flag =
      r.outcome === 'CREATED' ? 'access_created' : r.outcome === 'LINKED' ? (r.activated ? 'access_linked' : 'access_linked_pending') : 'access_already';
    redirect(`/e/${slug}/teachers/${id}?${flag}=1`);
  });
}

/** Cree les acces de tous les enseignants qui n'en ont pas encore (50 par passage). */
export async function bulkCreateTeacherAccessAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const r = await createMissingTeacherAccesses(ctx);
    redirect(`/e/${slug}/teachers?bulk=1&c=${r.created}&l=${r.linked}&n=${r.noPhone}&f=${r.failed}&r=${r.remaining}`);
  });
}

/**
 * Enregistre le service par défaut de chaque type de contrat. Les champs
 * arrivent sous la forme `min:PERMANENT` et `max:HOURLY` ; vide = aucune borne.
 */
export async function saveServiceDefaultsAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const read = (key: string): number | null => {
      const raw = String(fd.get(key) ?? '').trim();
      if (raw === '') return null;
      const n = Number(raw);
      return Number.isInteger(n) && n > 0 && n <= 60 ? n : null;
    };
    const defaults = Object.fromEntries(
      EMPLOYMENT_TYPES.map((type) => [type, { min: read(`min:${type}`), max: read(`max:${type}`) }]),
    ) as ServiceDefaults;
    await writeServiceDefaults(ctx, defaults);
    redirect(`/e/${slug}/teachers/service?enregistre=1`);
  });
}
