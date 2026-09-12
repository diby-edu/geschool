'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

export function JustificationForm({
  action,
  students,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  students: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label="Élève" htmlFor="studentId" required errors={err.studentId}>
        <Select id="studentId" name="studentId" defaultValue={v.studentId ?? ''} required>
          <option value="">—</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Du" htmlFor="coversFrom" required errors={err.coversFrom}>
          <Input id="coversFrom" name="coversFrom" type="date" defaultValue={v.coversFrom ?? today} required />
        </Field>
        <Field label="Au" htmlFor="coversTo" required errors={err.coversTo}>
          <Input id="coversTo" name="coversTo" type="date" defaultValue={v.coversTo ?? today} required />
        </Field>
      </div>
      <Field label="Motif" htmlFor="reason" required errors={err.reason}>
        <Textarea id="reason" name="reason" rows={2} defaultValue={v.reason ?? ''} required maxLength={500} />
      </Field>
      <SubmitButton variant="secondary" size="sm">Enregistrer le justificatif</SubmitButton>
    </form>
  );
}
