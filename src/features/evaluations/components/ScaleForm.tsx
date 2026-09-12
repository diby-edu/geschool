'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { ROUNDING_MODES } from '@/features/evaluations/schemas';
import type { FormState } from '@/lib/forms';
import type { ScaleRow } from '@/features/evaluations/config';

const ROUNDING_LABEL: Record<string, string> = {
  NONE: 'Aucun',
  HALF_UP: 'Au plus proche (0,5 ↑)',
  NEAREST_HALF: 'Au demi-point',
  NEAREST_QUARTER: 'Au quart de point',
  FLOOR: 'Inférieur',
  CEIL: 'Supérieur',
};

export function ScaleForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: ScaleRow;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const g = (k: string, d: string | number | boolean = '') =>
    v[k] !== undefined ? v[k] : (defaults ? String((defaults as unknown as Record<string, unknown>)[k] ?? d) : String(d));

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" htmlFor="code" required errors={err.code}>
          <Input id="code" name="code" defaultValue={g('code')} required maxLength={30} />
        </Field>
        <Field label="Nom" htmlFor="name" required errors={err.name}>
          <Input id="name" name="name" defaultValue={g('name')} required maxLength={120} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Type" htmlFor="kind" errors={err.kind}>
          <Select id="kind" name="kind" defaultValue={g('kind', 'NUMERIC')}>
            <option value="NUMERIC">Numérique</option>
            <option value="LETTER">Lettré</option>
          </Select>
        </Field>
        <Field label="Min" htmlFor="minScore" errors={err.minScore}>
          <Input id="minScore" name="minScore" type="number" step="0.5" defaultValue={g('min_score', 0)} />
        </Field>
        <Field label="Max" htmlFor="maxScore" errors={err.maxScore}>
          <Input id="maxScore" name="maxScore" type="number" step="0.5" defaultValue={g('max_score', 20)} />
        </Field>
        <Field label="Seuil réussite" htmlFor="passingScore" errors={err.passingScore}>
          <Input id="passingScore" name="passingScore" type="number" step="0.5" defaultValue={g('passing_score', 10)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Décimales" htmlFor="decimals" errors={err.decimals}>
          <Input id="decimals" name="decimals" type="number" min="0" max="4" defaultValue={g('decimals', 2)} />
        </Field>
        <Field label="Arrondi" htmlFor="rounding" errors={err.rounding}>
          <Select id="rounding" name="rounding" defaultValue={g('rounding', 'HALF_UP')}>
            {ROUNDING_MODES.map((r) => <option key={r} value={r}>{ROUNDING_LABEL[r] ?? r}</option>)}
          </Select>
        </Field>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefault" defaultChecked={defaults?.is_default ?? false} className="size-4" />
            Barème par défaut
          </label>
        </div>
      </div>
      <SubmitButton variant="secondary" size="sm">{submitLabel}</SubmitButton>
    </form>
  );
}
