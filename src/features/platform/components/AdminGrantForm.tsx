'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Donner les droits plateforme à quelqu'un qui a DÉJÀ un compte.
 *
 * On ne crée pas le compte ici : un Super Admin se recrute parmi des personnes
 * connues, pas par une invitation ouverte.
 */
export function AdminGrantForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter un administrateur</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <Field
            label="E-mail du compte"
            htmlFor="email"
            required
            hint="La personne doit déjà avoir un compte sur la plateforme."
          >
            <Input id="email" name="email" type="email" required placeholder="nom@exemple.ci" />
          </Field>
          <Field label="Note" htmlFor="note" hint="Pourquoi, et pour combien de temps (facultatif)">
            <Input id="note" name="note" maxLength={120} placeholder="Support technique" />
          </Field>
          <SubmitButton size="sm">Accorder les droits</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
