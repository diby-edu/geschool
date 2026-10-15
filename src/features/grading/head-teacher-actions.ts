'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { certifyClass, flagGrade, resolveFlag, unlockClass } from './head-teacher';

/** Le professeur principal signale une case élève × matière (rien à écrire). */
export async function flagGradeAction(slug: string, classId: string, periodId: string, studentId: string, subjectId: string): Promise<{ error?: string }> {
  const state = await runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await flagGrade(ctx, classId, periodId, studentId, subjectId);
  });
  revalidatePath(`/e/${slug}/professeur-principal`);
  return state.error ? { error: state.error } : {};
}

/** Le professeur principal annule un signalement fait par erreur. */
export async function cancelFlagAction(slug: string, classId: string, periodId: string, flagId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await resolveFlag(ctx, flagId, 'CANCELLED');
    redirect(`/e/${slug}/professeur-principal?class=${classId}&period=${periodId}`);
  });
}

/** Le professeur de la matière règle le signalement : corrigé ou maintenu. */
export async function resolveFlagAction(
  slug: string,
  classId: string,
  subjectId: string,
  periodId: string,
  flagId: string,
  status: 'CORRECTED' | 'MAINTAINED',
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await resolveFlag(ctx, flagId, status);
    redirect(`/e/${slug}/evaluations/mine/${classId}/moyennes?period=${periodId}&subject=${subjectId}&flag=${status.toLowerCase()}`);
  });
}

export async function certifyClassAction(slug: string, classId: string, periodId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await certifyClass(ctx, classId, periodId);
    redirect(`/e/${slug}/professeur-principal?class=${classId}&period=${periodId}&certified=1`);
  });
}

/** Déverrouillage par la direction, motif obligatoire. */
export async function unlockClassAction(slug: string, classId: string, periodId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const reason = String(fd.get('reason') ?? '').trim();
    if (reason.length < 3) throw new ValidationError('Indiquez le motif du déverrouillage.');
    const ctx = await getTenantContext(slug);
    await unlockClass(ctx, classId, periodId, reason);
    redirect(`/e/${slug}/bulletins?class=${classId}&period=${periodId}&unlocked=1`);
  });
}
