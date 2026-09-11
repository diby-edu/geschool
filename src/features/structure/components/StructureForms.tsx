'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function CycleCreateForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter un cycle</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_5rem]">
            <Field label="Code" htmlFor="c-code" required errors={err.code}>
              <Input id="c-code" name="code" required placeholder="SEC" />
            </Field>
            <Field label="Nom" htmlFor="c-name" required errors={err.name}>
              <Input id="c-name" name="name" required placeholder="Secondaire" />
            </Field>
            <Field label="Ordre" htmlFor="c-seq" errors={err.sequence}>
              <Input id="c-seq" name="sequence" type="number" min="0" defaultValue="0" />
            </Field>
          </div>
          <SubmitButton size="sm">Ajouter le cycle</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function LevelCreateForm({ action, cycles }: { action: Action; cycles: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter un niveau</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <Field label="Cycle" htmlFor="l-cycle" required errors={err.cycleId}>
            <Select id="l-cycle" name="cycleId" required defaultValue="">
              <option value="" disabled>
                — Choisir —
              </option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_5rem]">
            <Field label="Code" htmlFor="l-code" required errors={err.code}>
              <Input id="l-code" name="code" required placeholder="4E" />
            </Field>
            <Field label="Nom" htmlFor="l-name" required errors={err.name}>
              <Input id="l-name" name="name" required placeholder="Quatrieme" />
            </Field>
            <Field label="Ordre" htmlFor="l-seq" errors={err.sequence}>
              <Input id="l-seq" name="sequence" type="number" min="0" defaultValue="0" />
            </Field>
          </div>
          <SubmitButton size="sm">Ajouter le niveau</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
