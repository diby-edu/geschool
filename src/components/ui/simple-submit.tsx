'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Bouton d'action sans confirmation, pour une Server Action idempotente
 * (envoyer/renvoyer un identifiant, envoi groupe). Affiche l'erreur eventuelle.
 */
export function SimpleSubmit({
  action,
  label,
  small = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  small?: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <span className="inline-flex flex-col items-end gap-1">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <form action={formAction}>
        <SubmitButton variant="secondary" size={small ? 'sm' : 'md'}>
          {label}
        </SubmitButton>
      </form>
    </span>
  );
}
