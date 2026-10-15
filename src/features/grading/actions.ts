'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { markAveragesComplete, reopenAverages } from './completion';
import { setExemption } from './exemptions';

function back(slug: string, classId: string, subjectId: string, periodId: string, flag: string): string {
  return `/e/${slug}/evaluations/mine/${classId}/moyennes?period=${periodId}&subject=${subjectId}&${flag}=1`;
}

/** L'enseignant marque ses moyennes de cette classe et matière « terminées ». */
export async function completeAveragesAction(slug: string, classId: string, subjectId: string, periodId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await markAveragesComplete(ctx, classId, subjectId, periodId);
    redirect(back(slug, classId, subjectId, periodId, 'completed'));
  });
}

/** …ou les rouvre, tant que la période de calcul est ouverte. */
export async function reopenAveragesAction(slug: string, classId: string, subjectId: string, periodId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await reopenAverages(ctx, classId, subjectId, periodId);
    redirect(back(slug, classId, subjectId, periodId, 'reopened'));
  });
}

/** Le professeur d'EPS déclare un élève dispensé (ou retire la dispense) pour la période. */
export async function setExemptionAction(
  slug: string,
  classId: string,
  subjectId: string,
  periodId: string,
  studentId: string,
  exempt: boolean,
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await setExemption(ctx, studentId, periodId, subjectId, exempt);
    redirect(back(slug, classId, subjectId, periodId, exempt ? 'exempted' : 'unexempted'));
  });
}
