'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Un message à écrire (lot 5) : nouvelle demande (avec un objet) ou réponse
 * dans un fil. La saisie reste en place si l'envoi échoue.
 */
export function TextForm({
  action,
  withSubject = false,
  label,
  submit,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  withSubject?: boolean;
  label: string;
  submit: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {withSubject ? (
        <Field label="Objet" htmlFor="subject" required>
          <Input id="subject" name="subject" maxLength={140} required defaultValue={state.values?.subject} placeholder="Ex. : comment ajouter une 2ᵉ langue vivante ?" />
        </Field>
      ) : null}
      <Field label={label} htmlFor="body" required>
        <textarea
          id="body"
          name="body"
          required
          maxLength={4000}
          rows={5}
          defaultValue={state.values?.body}
          className="w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-3 py-2 text-sm"
        />
      </Field>
      <SubmitButton>{submit}</SubmitButton>
    </form>
  );
}
