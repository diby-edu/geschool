'use server';

import { redirect } from 'next/navigation';
import { formValues, runFormAction, type FormState } from '@/lib/forms';
import { auditPlatform } from '@/lib/audit';
import { saveSchoolIdentity } from '@/features/settings/identity';
import { suspendAccess, reactivateAccess } from '@/services/access-status';
import { revealTemporaryPassword, type RevealedCredentials } from '@/services/credentials';
import { transferSchoolOwner } from '@/services/school-owner';
import { requireAdmin } from './admin';
import { platformSchoolContext } from './school-sheet';

/** Actions de la fiche école du Super Admin (lot 3). Chacune revient sur la fiche. */

const sheet = (id: string, onglet: string, flag: string) => `/admin/etablissements/${id}?onglet=${onglet}&${flag}=1`;

export async function updateSchoolIdentityPlatformAction(schoolId: string, slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await platformSchoolContext(slug);
    await saveSchoolIdentity(ctx, fd);
    await auditPlatform(ctx.user.id, { schoolId, action: 'platform.school_identity', module: 'platform', entityType: 'school', entityId: schoolId });
    redirect(sheet(schoolId, 'identite', 'enregistre'));
  }).then((state) => (state.error || state.fieldErrors ? { ...state, values: formValues(fd) } : state));
}

export type OwnerState = FormState & { done?: { email: string | null; tempPassword: string | null; removed: number } };

export async function transferOwnerAction(schoolId: string, _p: OwnerState, fd: FormData): Promise<OwnerState> {
  let done: OwnerState['done'];
  const state = await runFormAction(async () => {
    const { userId: actor } = await requireAdmin();
    const mode = String(fd.get('mode') ?? 'member');
    const target =
      mode === 'new'
        ? { email: String(fd.get('email') ?? ''), firstName: String(fd.get('firstName') ?? ''), lastName: String(fd.get('lastName') ?? '') }
        : { userId: String(fd.get('userId') ?? '') };
    const removeFromOthers = fd.get('removeOld') === 'on';
    const r = await transferSchoolOwner(schoolId, target, removeFromOthers);
    await auditPlatform(actor, {
      schoolId,
      action: 'platform.owner_transfer',
      module: 'platform',
      entityType: 'user',
      entityId: r.userId,
      after: { newAccount: r.tempPassword !== null, email: r.email, removedFrom: r.removed },
    });
    done = { email: r.email, tempPassword: r.tempPassword, removed: r.removed.length };
  });
  return done ? { done } : state;
}

export async function suspendPersonAction(schoolId: string, slug: string, userId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await platformSchoolContext(slug);
    await suspendAccess(ctx, userId);
    redirect(sheet(schoolId, 'personnes', 'suspendu'));
  });
}

export async function reactivatePersonAction(schoolId: string, slug: string, userId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await platformSchoolContext(slug);
    await reactivateAccess(ctx, userId);
    redirect(sheet(schoolId, 'personnes', 'reactive'));
  });
}

export type PersonRevealState = FormState & { credentials?: RevealedCredentials };

/** Nouveau mot de passe temporaire, montré UNE fois (jamais stocké ni journalisé en clair). */
export async function revealPersonCredentialsAction(slug: string, userId: string, _p: PersonRevealState, _fd: FormData): Promise<PersonRevealState> {
  let credentials: RevealedCredentials | undefined;
  const state = await runFormAction(async () => {
    const ctx = await platformSchoolContext(slug);
    credentials = await revealTemporaryPassword(ctx, userId);
  });
  return credentials ? { credentials } : state;
}
