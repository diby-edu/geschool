'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { formValues, runFormAction, type FormState } from '@/lib/forms';
import { requireWritable } from '@/lib/permissions';
import { saveSchoolIdentity } from './identity';
import { writeSettings } from './school-settings';
import { readMatriculeMode } from './enrollment-policy-types';

/** Enregistre l'identité et les coordonnées de l'établissement (`settings.update`, appliqué aussi par la base). */
/** Règles d'inscription : d'où vient le matricule d'un élève. */
export async function updateEnrollmentPolicyAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'settings.update');
    await writeSettings(ctx, 'academic', { matriculeMode: readMatriculeMode(fd.get('matriculeMode')) });
    redirect(`/e/${slug}/parametres/inscriptions?updated=1`);
  });
}

export async function updateIdentityAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'settings.update');

    await saveSchoolIdentity(ctx, fd);
    redirect(`/e/${slug}/parametres/identite?updated=1`);
  }).then((state) => (state.error || state.fieldErrors ? { ...state, values: formValues(fd) } : state));
}

