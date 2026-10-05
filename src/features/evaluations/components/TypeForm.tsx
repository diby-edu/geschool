'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { TypeRow } from '@/features/evaluations/config';

/**
 * Un type d'evaluation : interrogation, devoir, composition.
 *
 * Le « code » ne se demande plus — il se deduit du nom. Restent les deux
 * seules decisions qui changent quelque chose : le poids habituel, et si cela
 * entre dans la moyenne.
 */
export function TypeForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: TypeRow;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const g = (k: string, d: string | number = '') =>
    v[k] !== undefined ? v[k] : defaults ? String((defaults as unknown as Record<string, unknown>)[k] ?? d) : String(d);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Nom" htmlFor="name" required errors={err.name} hint="Interrogation, Devoir, Composition…">
            <Input id="name" name="name" defaultValue={g('name')} required maxLength={120} placeholder="Devoir" />
          </Field>
        </div>
        <div className="w-36">
          <Field
            label="Poids habituel"
            htmlFor="defaultCoefficient"
            required
            errors={err.defaultCoefficient}
            hint="2 = compte double."
          >
            <Input
              id="defaultCoefficient"
              name="defaultCoefficient"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={g('default_coefficient', 1)}
              required
            />
          </Field>
        </div>
        <div className="w-28">
          <Field label="Rang" htmlFor="sequence" errors={err.sequence} hint="Ordre d’affichage.">
            <Input id="sequence" name="sequence" type="number" min="0" defaultValue={g('sequence', 0)} />
          </Field>
        </div>
        <label className="flex max-w-xs items-start gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="countsInAverage"
            defaultChecked={defaults ? defaults.counts_in_average : true}
            className="mt-0.5 size-4"
          />
          <span>
            Entre dans la moyenne
            <span className="block text-xs text-[color:var(--muted-foreground)]">
              Décochez pour un essai blanc, qui se note sans peser sur le bulletin.
            </span>
          </span>
        </label>
        <SubmitButton variant="secondary" size="sm">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
