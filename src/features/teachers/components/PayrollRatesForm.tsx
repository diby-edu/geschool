'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/** Les deux taux de l'école ; un enseignant peut avoir le sien sur sa fiche. */
export function PayrollRatesForm({
  action,
  vacationRate,
  overtimeRate,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  vacationRate: number;
  overtimeRate: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const input = 'h-9 w-32 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm';
  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="space-y-1">
          <span className="block font-medium">Taux horaire des vacataires</span>
          <span className="flex items-center gap-1">
            <input name="vacationRate" inputMode="decimal" defaultValue={vacationRate || ''} placeholder="3000" className={input} />
            F / heure
          </span>
        </label>
        <label className="space-y-1">
          <span className="block font-medium">Taux des heures supplémentaires (permanents)</span>
          <span className="flex items-center gap-1">
            <input name="overtimeRate" inputMode="decimal" defaultValue={overtimeRate || ''} placeholder="3000" className={input} />
            F / heure
          </span>
        </label>
        <SubmitButton size="sm">Enregistrer les taux</SubmitButton>
      </div>
    </form>
  );
}
