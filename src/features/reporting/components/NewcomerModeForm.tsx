'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { NEWCOMER_LABEL, NEWCOMER_MODES, type NewcomerAnnualMode } from '@/features/reporting/annual-core';

/** Élève arrivé en cours d'année : chaque établissement choisit sa règle. */
export function NewcomerModeForm({
  action,
  mode,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  mode: NewcomerAnnualMode;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Élève arrivé en cours d’année</h2>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Il n’a pas de bulletin chez vous pour les premières périodes. Comment calculer sa moyenne annuelle ?
        </p>
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="space-y-2 text-sm">
        {NEWCOMER_MODES.map((m) => (
          <label key={m} className="flex items-start gap-2">
            <input type="radio" name="newcomerAnnual" value={m} defaultChecked={mode === m} className="mt-1" />
            <span>
              {NEWCOMER_LABEL[m]}
              <span className="block text-xs text-[color:var(--muted-foreground)]">
                {m === 'ATTENDED'
                  ? 'Exemple : arrivé au 2e trimestre, sa moyenne annuelle est celle des 2e et 3e trimestres.'
                  : 'Les moyennes de son ancien bulletin se saisissent sur la page du conseil de classe. Tant qu’elles manquent, pas de moyenne annuelle.'}
              </span>
            </span>
          </label>
        ))}
      </div>
      <SubmitButton size="sm">Enregistrer</SubmitButton>
    </form>
  );
}
