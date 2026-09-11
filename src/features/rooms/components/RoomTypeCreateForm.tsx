'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

export function RoomTypeCreateForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter un type</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Ex. LAB">
              <Input id="code" name="code" required />
            </Field>
            <Field label="Nom" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" required placeholder="Laboratoire" />
            </Field>
          </div>
          <SubmitButton size="sm">Ajouter</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
