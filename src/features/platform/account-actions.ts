'use server';

import { redirect } from 'next/navigation';
import { runFormAction, type FormState } from '@/lib/forms';
import { auditPlatform } from '@/lib/audit';
import { suspendAccess, reactivateAccess } from '@/services/access-status';
import { unlockAccount } from '@/services/account-unlock';
import { changeLoginIdentifier, signOutEverywhere } from '@/services/account-login';
import { deleteOrphanAccount } from '@/services/orphan-account';
import { requireAdmin } from './admin';
import { platformSchoolContext } from './school-sheet';
import { getAccountSheet } from './account-sheet';

/**
 * Actions du Super Admin sur un compte (lot 4, décidé le 2026-10-26) :
 * débloquer, suspendre ou réactiver dans une école ou partout, supprimer un
 * compte sans école. Chaque action passe par le contexte de l'école : les mêmes
 * règles et le même journal qu'à l'intérieur de l'école.
 */

const back = (userId: string, flag: string) => `/admin/comptes/${userId}?${flag}=1`;

export async function unlockAccountPlatformAction(userId: string, slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await unlockAccount(await platformSchoolContext(slug), userId);
    redirect(back(userId, 'debloque'));
  });
}

export async function suspendInSchoolAction(userId: string, slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await suspendAccess(await platformSchoolContext(slug), userId);
    redirect(back(userId, 'suspendu'));
  });
}

export async function reactivateInSchoolAction(userId: string, slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await reactivateAccess(await platformSchoolContext(slug), userId);
    redirect(back(userId, 'reactive'));
  });
}

export async function changeLoginPlatformAction(userId: string, slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await changeLoginIdentifier(await platformSchoolContext(slug), userId, String(fd.get('identifier') ?? ''));
    redirect(back(userId, 'identifiant'));
  });
}

/** Ferme ses connexions sur tous ses appareils (elles valent pour toutes ses écoles). */
export async function signOutPlatformAction(userId: string, slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await signOutEverywhere(await platformSchoolContext(slug), userId);
    redirect(back(userId, 'deconnecte'));
  });
}

/** Suspendre dans toutes ses écoles d'un coup. */
export async function suspendEverywhereAction(userId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const sheet = await getAccountSheet(userId);
    const targets = sheet.schools.filter((s) => s.access && s.access.accountStatus !== 'SUSPENDED');
    for (const s of targets) await suspendAccess(await platformSchoolContext(s.slug), userId);
    redirect(back(userId, 'suspendu'));
  });
}

/** Supprimer un compte rattaché à aucune école (revérifié dans le service). */
export async function deleteOrphanAccountAction(userId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId: actor } = await requireAdmin();
    await deleteOrphanAccount(userId);
    await auditPlatform(actor, { action: 'platform.orphan_delete', module: 'platform', entityType: 'user', entityId: userId });
    redirect('/admin/comptes?f=ORPHAN&supprime=1');
  });
}
