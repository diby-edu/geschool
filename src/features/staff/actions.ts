'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { formValues, runFormAction, type FormState } from '@/lib/forms';
import { createStaff, updateStaff } from '@/services/staff';
import { reactivateAccess, suspendAccess } from '@/services/access-status';
import { revealTemporaryPassword, type RevealedCredentials } from '@/services/credentials';
import { staffSchema, staffUpdateSchema } from './schemas';

/** Le formulaire est ré-affiché tel quel après une erreur (les fonctions cochées comprises). */
const withValues =
  (fd: FormData) =>
  (state: FormState): FormState =>
    state.error || state.fieldErrors
      ? { ...state, values: { ...formValues(fd), functions: fd.getAll('functions').join(',') } }
      : state;

function fields(fd: FormData) {
  return {
    lastName: fd.get('lastName'),
    firstName: fd.get('firstName'),
    gender: fd.get('gender') ?? '',
    employmentType: fd.get('employmentType') ?? '',
    birthDate: fd.get('birthDate') ?? '',
    birthPlace: fd.get('birthPlace') ?? '',
    phone2: fd.get('phone2') ?? '',
    email: fd.get('email') ?? '',
    diploma: fd.get('diploma') ?? '',
    diplomaDetail: fd.get('diplomaDetail') ?? '',
    staffNumber: fd.get('staffNumber') ?? '',
    hireDate: fd.get('hireDate') ?? '',
  };
}

export async function createStaffAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const input = staffSchema.parse({ ...fields(fd), phone: fd.get('phone') ?? '', functions: fd.getAll('functions') });
    const result = await createStaff(ctx, input);
    redirect(`/e/${slug}/personnel/${result.userId}?${result.outcome === 'CREATED' ? 'created' : 'linked'}=1`);
  }).then(withValues(fd));
}

export async function updateStaffAction(slug: string, userId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    // Fonctions envoyées seulement si le formulaire les rend modifiables : alors « aucune » est une erreur.
    const input = staffUpdateSchema.parse({
      ...fields(fd),
      ...(fd.get('functionsEditable') === '1' ? { functions: fd.getAll('functions') } : {}),
    });
    await updateStaff(ctx, userId, input);
    redirect(`/e/${slug}/personnel/${userId}?updated=1`);
  }).then(withValues(fd));
}

export async function suspendStaffAction(slug: string, userId: string, _prev: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await suspendAccess(ctx, userId);
    redirect(`/e/${slug}/personnel/${userId}?suspended=1`);
  });
}

export async function reactivateStaffAction(slug: string, userId: string, _prev: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await reactivateAccess(ctx, userId);
    redirect(`/e/${slug}/personnel/${userId}?reactivated=1`);
  });
}

/** État de l'affichage unique : les identifiants ne vivent que dans cette réponse. */
export type RevealState = FormState & { credentials?: RevealedCredentials };

/**
 * Génère un mot de passe temporaire et le RENVOIE pour affichage unique (aucun
 * SMS). Le secret n'est ni stocké, ni journalisé, ni mis dans l'URL : il n'existe
 * que dans cette réponse, que le navigateur ne met pas en cache.
 */
export async function revealCredentialsAction(
  slug: string,
  userId: string,
  _prev: RevealState,
  _fd: FormData,
): Promise<RevealState> {
  let credentials: RevealedCredentials | undefined;
  const state = await runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    credentials = await revealTemporaryPassword(ctx, userId);
  });
  return credentials ? { credentials } : state;
}
