'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Les trois dates de fin de trimestre. « Prolonger » une étape, c'est décaler
 * sa date ici ; vider les trois retire la fin de trimestre (saisie normale).
 */
export function TermDatesForm({
  action,
  defaults,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: { stopOn: string | null; studentEndsOn: string | null; headEndsOn: string | null };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = state.values ?? {};
  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="1. Arrêt des notes" htmlFor="stopOn">
          <Input id="stopOn" name="stopOn" type="date" defaultValue={v.stopOn ?? defaults.stopOn ?? ''} />
        </Field>
        <Field label="2. Fin de la vérification avec les élèves" htmlFor="studentEndsOn">
          <Input id="studentEndsOn" name="studentEndsOn" type="date" defaultValue={v.studentEndsOn ?? defaults.studentEndsOn ?? ''} />
        </Field>
        <Field label="3. Fin de la vérification du professeur principal" htmlFor="headEndsOn">
          <Input id="headEndsOn" name="headEndsOn" type="date" defaultValue={v.headEndsOn ?? defaults.headEndsOn ?? ''} />
        </Field>
        <SubmitButton size="sm">Enregistrer les dates</SubmitButton>
      </div>
    </form>
  );
}
