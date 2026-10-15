'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { setCouncilAverage } from './council';
import { setPreviousSchoolAverage } from './previous-school';
import { gradingParams } from '@/features/evaluations/scale';

/** Le conseil retient une moyenne (repêchage, dérogation), ou la retire. */
export async function setCouncilAverageAction(
  slug: string,
  classId: string,
  periodId: string,
  studentId: string,
  computed: number | null,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const remove = fd.get('remove') === '1';
    const raw = String(fd.get('average') ?? '').trim().replace(',', '.');
    const average = remove ? null : Number(raw);
    if (!remove && (raw === '' || !Number.isFinite(average))) throw new ValidationError('Saisissez la moyenne retenue, par exemple 10 ou 9,5.');
    const ctx = await getTenantContext(slug);
    if (average !== null) {
      const { scaleMax } = await gradingParams(ctx);
      if (average < 0 || average > scaleMax) {
        throw new ValidationError(`La moyenne retenue doit être entre 0 et ${String(scaleMax).replace('.', ',')}.`);
      }
    }
    await setCouncilAverage(ctx, classId, periodId, studentId, average, computed, String(fd.get('reason') ?? ''));
    redirect(`/e/${slug}/conseil?class=${classId}&period=${periodId}&saved=1#e-${studentId}`);
  }).then((s) => (s.error ? { ...s, values: formValues(fd) } : s));
}

/** Moyenne de l'ancienne école d'un élève arrivé en cours d'année, pour une période manquante. */
export async function savePreviousSchoolAction(
  slug: string,
  classId: string,
  periodId: string,
  studentId: string,
  missingPeriodId: string,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const remove = fd.get('remove') === '1';
    const raw = String(fd.get('average') ?? '').trim().replace(',', '.');
    const average = remove ? null : Number(raw);
    if (!remove && (raw === '' || !Number.isFinite(average))) throw new ValidationError('Saisissez la moyenne, par exemple 11,25.');
    const ctx = await getTenantContext(slug);
    if (average !== null) {
      const { scaleMax } = await gradingParams(ctx);
      if (average < 0 || average > scaleMax) {
        throw new ValidationError(`La moyenne doit être entre 0 et ${String(scaleMax).replace('.', ',')}.`);
      }
    }
    await setPreviousSchoolAverage(ctx, studentId, missingPeriodId, average, String(fd.get('school') ?? ''));
    redirect(`/e/${slug}/conseil?class=${classId}&period=${periodId}&nouveau=1#n-${studentId}`);
  }).then((s) => (s.error ? { ...s, values: formValues(fd) } : s));
}
