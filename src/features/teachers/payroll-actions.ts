'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { writePayrollRates } from './payroll';

/** Taux de l'école : vacataires, et heures supplémentaires des permanents. */
export async function savePayrollRatesAction(slug: string, month: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const read = (k: string) => {
      const n = Number(String(fd.get(k) ?? '').replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) throw new ValidationError('Un taux est un montant positif, en F CFA par heure.');
      return n;
    };
    const ctx = await getTenantContext(slug);
    await writePayrollRates(ctx, { vacationRate: read('vacationRate'), overtimeRate: read('overtimeRate') });
    redirect(`/e/${slug}/teachers/heures?mois=${month}&taux=1`);
  });
}
