'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { enrollmentPolicy, matriculeIsRequired } from '@/features/settings/enrollment-policy';
import { guardianEditSchema, studentIdentitySchemaFor } from './edit-schemas';
import { addGuardian, detachGuardian, updateGuardian, updateStudentIdentity } from './edit';

const back = (slug: string, studentId: string, flag: string) => `/e/${slug}/students/${studentId}/modifier?${flag}=1`;

const guardianFrom = (fd: FormData) =>
  guardianEditSchema.parse({
    firstName: fd.get('firstName'),
    lastName: fd.get('lastName'),
    phone: fd.get('phone'),
    relationship: fd.get('relationship') ?? '',
    isPrimaryContact: fd.get('isPrimaryContact') === 'on',
  });

/** Corriger l'identité d'un élève. */
export async function updateStudentAction(slug: string, studentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const parsed = studentIdentitySchemaFor(matriculeIsRequired(await enrollmentPolicy(ctx))).parse({
      matricule: fd.get('matricule') ?? '',
      firstName: fd.get('firstName'),
      lastName: fd.get('lastName'),
      gender: fd.get('gender') ?? '',
      birthDate: fd.get('birthDate') ?? '',
      birthPlace: fd.get('birthPlace') ?? '',
      isStateAssigned: fd.get('isStateAssigned') ?? '',
    });
    await updateStudentIdentity(ctx, studentId, parsed);
    redirect(back(slug, studentId, 'eleve'));
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

/** Modifier un responsable de l'élève (nom, téléphone, lien, contact principal). */
export async function updateGuardianAction(
  slug: string,
  studentId: string,
  guardianId: string,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await updateGuardian(ctx, studentId, guardianId, guardianFrom(fd));
    redirect(back(slug, studentId, 'responsable'));
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

/** Ajouter un responsable : retrouvé par son téléphone, ou créé avec son accès Parent. */
export async function addGuardianAction(slug: string, studentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await addGuardian(ctx, studentId, guardianFrom(fd));
    redirect(back(slug, studentId, 'ajoute'));
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

/** Retirer un responsable de cet élève (sa fiche reste). */
export async function detachGuardianAction(
  slug: string,
  studentId: string,
  guardianId: string,
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await detachGuardian(ctx, studentId, guardianId);
    redirect(back(slug, studentId, 'retire'));
  });
}
