'use server';

import { redirect } from 'next/navigation';
import { runFormAction, type FormState } from '@/lib/forms';
import { grantPlatformAdmin, revokePlatformAdmin, setSchoolStatus, type SchoolStatus } from './admin';

/** Suspendre, réactiver ou archiver un établissement. */
export async function setSchoolStatusAction(
  schoolId: string,
  status: SchoolStatus,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    await setSchoolStatus(schoolId, status, String(fd.get('reason') ?? '').trim());
    redirect(`/admin/etablissements/${schoolId}?statut=1`);
  });
}

export async function grantPlatformAdminAction(_p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await grantPlatformAdmin(String(fd.get('email') ?? ''), String(fd.get('note') ?? '').trim());
    redirect('/admin/administrateurs?ajoute=1');
  });
}

export async function revokePlatformAdminAction(userId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await revokePlatformAdmin(userId);
    redirect('/admin/administrateurs?retire=1');
  });
}
