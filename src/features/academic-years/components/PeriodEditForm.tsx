'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { trackChoices } from '../periods-by-track';

/** Modification d'une période (nom, type, dates) — son rang ne change pas. */
export function PeriodEditForm({
  action,
  defaults,
  min,
  max,
  idPrefix,
  schoolTracks = [],
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: { name: string; kind: string; startsOn: string; endsOn: string; isGradingPeriod: boolean; track: string };
  min: string;
  max: string;
  idPrefix: string;
  schoolTracks?: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const id = (field: string) => `${idPrefix}-${field}`;
  const choices = trackChoices(schoolTracks);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom" htmlFor={id('name')} required errors={err.name}>
          <Input id={id('name')} name="name" required defaultValue={defaults.name} />
        </Field>
        <Field label="Type" htmlFor={id('kind')} errors={err.kind}>
          <Select id={id('kind')} name="kind" defaultValue={defaults.kind}>
            <option value="TERM">Trimestre</option>
            <option value="SEMESTER">Semestre</option>
            <option value="QUARTER">Quadrimestre</option>
          </Select>
        </Field>
      </div>
      {choices.length > 1 ? (
        <Field label="Ordre concerné" htmlFor={id('track')} errors={err.track} hint="Le technique et le professionnel fonctionnent par semestres, le général par trimestres.">
          <Select id={id('track')} name="track" defaultValue={defaults.track}>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Début" htmlFor={id('starts')} required errors={err.startsOn}>
          <Input id={id('starts')} name="startsOn" type="date" min={min} max={max} required defaultValue={defaults.startsOn} />
        </Field>
        <Field label="Fin" htmlFor={id('ends')} required errors={err.endsOn}>
          <Input id={id('ends')} name="endsOn" type="date" min={min} max={max} required defaultValue={defaults.endsOn} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isGradingPeriod" defaultChecked={defaults.isGradingPeriod} className="size-4" />
        Période de notation (bulletin)
      </label>
      <SubmitButton size="sm">Enregistrer</SubmitButton>
    </form>
  );
}
