'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Values = Partial<Record<'levelId' | 'code' | 'name' | 'capacity' | 'headTeacherId', string>>;

export function ClassForm({
  action,
  levels,
  teachers,
  defaultValues = {},
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  levels: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
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

          <Field label="Niveau" htmlFor="levelId" required errors={err.levelId}>
            <Select id="levelId" name="levelId" required defaultValue={v.levelId ?? ''}>
              <option value="" disabled>
                — Choisir —
              </option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Ex. 4E1">
              <Input id="code" name="code" defaultValue={v.code} required />
            </Field>
            <Field label="Capacite" htmlFor="capacity" errors={err.capacity}>
              <Input id="capacity" name="capacity" type="number" min="0" defaultValue={v.capacity ?? '40'} />
            </Field>
          </div>

          <Field label="Nom" htmlFor="name" required errors={err.name}>
            <Input id="name" name="name" defaultValue={v.name} required placeholder="4e 1" />
          </Field>

          <Field label="Professeur principal" htmlFor="headTeacherId" errors={err.headTeacherId}>
            <Select id="headTeacherId" name="headTeacherId" defaultValue={v.headTeacherId ?? ''}>
              <option value="">— Aucun —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="pt-2">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
