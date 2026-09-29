'use server';

import { redirect } from 'next/navigation';
import { runFormAction, type FormState } from '@/lib/forms';
import { takeUsageSnapshot } from './service';

/** Relever l'usage de toutes les écoles, à la date du jour. */
export async function snapshotUsageAction(_p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const lignes = await takeUsageSnapshot();
    redirect(`/admin/usage?releve=${lignes}`);
  });
}
