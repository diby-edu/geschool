'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { TypeRow } from '@/features/evaluations/config';

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
    v[k] !== undefined ? v[k] : (defaults ? String((defaults as unknown as Record<string, unknown>)[k] ?? d) : String(d));

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {state.error ? <div className="w-full"><Alert tone="error">{state.error}</Alert></div> : null}
      <div className="w-28">
        <Field label="Code" htmlFor="code" required errors={err.code}>
          <Input id="code" name="code" defaultValue={g('code')} required maxLength={30} />
        </Field>
      </div>
      <div className="w-48">
        <Field label="Nom" htmlFor="name" required errors={err.name}>
          <Input id="name" name="name" defaultValue={g('name')} required maxLength={120} />
        </Field>
      </div>
      <div className="w-28">
        <Field label="Coef. défaut" htmlFor="defaultCoefficient" required errors={err.defaultCoefficient}>
          <Input id="defaultCoefficient" name="defaultCoefficient" type="number" min="0.01" step="0.01" defaultValue={g('default_coefficient', 1)} required />
        </Field>
      </div>
      <div className="w-20">
        <Field label="Ordre" htmlFor="sequence" errors={err.sequence}>
          <Input id="sequence" name="sequence" type="number" min="0" defaultValue={g('sequence', 0)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="countsInAverage" defaultChecked={defaults ? defaults.counts_in_average : true} className="size-4" />
        Compte dans la moyenne
      </label>
      <SubmitButton variant="secondary" size="sm">{submitLabel}</SubmitButton>
    </form>
  );
}
