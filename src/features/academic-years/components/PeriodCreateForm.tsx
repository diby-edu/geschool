'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

export function PeriodCreateForm({
  action,
  nextSequence,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  nextSequence: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter une periode</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" required placeholder="1er trimestre" />
            </Field>
            <Field label="Rang" htmlFor="sequence" required errors={err.sequence}>
              <Input id="sequence" name="sequence" type="number" min="1" defaultValue={String(nextSequence)} required />
            </Field>
          </div>
          <Field label="Type" htmlFor="kind" errors={err.kind}>
            <Select id="kind" name="kind" defaultValue="TERM">
              <option value="TERM">Trimestre</option>
              <option value="SEMESTER">Semestre</option>
              <option value="QUARTER">Quadrimestre</option>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Debut" htmlFor="startsOn" required errors={err.startsOn}>
              <Input id="startsOn" name="startsOn" type="date" required />
            </Field>
            <Field label="Fin" htmlFor="endsOn" required errors={err.endsOn}>
              <Input id="endsOn" name="endsOn" type="date" required />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isGradingPeriod" defaultChecked className="size-4" />
            Periode de notation (bulletin)
          </label>
          <SubmitButton size="sm">Ajouter</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
