'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Values = Partial<Record<'name' | 'startsOn' | 'endsOn', string>>;

export function YearForm({
  action,
  defaultValues = {},
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: Values;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = { ...defaultValues, ...(state.values ?? {}) };
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <Field label="Nom" htmlFor="name" required errors={err.name} hint="Ex. 2026-2027">
            <Input id="name" name="name" defaultValue={v.name} required autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Debut" htmlFor="startsOn" required errors={err.startsOn}>
              <Input id="startsOn" name="startsOn" type="date" defaultValue={v.startsOn} required />
            </Field>
            <Field label="Fin" htmlFor="endsOn" required errors={err.endsOn}>
              <Input id="endsOn" name="endsOn" type="date" defaultValue={v.endsOn} required />
            </Field>
          </div>
          <div className="pt-2">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
