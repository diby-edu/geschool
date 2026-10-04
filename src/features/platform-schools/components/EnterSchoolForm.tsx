'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Entrer dans l'espace d'un etablissement, pour le support.
 *
 * Deux clics plutot qu'un : on entre chez un client, pas dans un dossier. Le
 * motif est facultatif mais la trace, elle, est posee quoi qu'il arrive.
 */
export function EnterSchoolForm({ action, schoolName }: { action: Action; schoolName: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOuvert(true)}>
        Ouvrir son espace
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input
        name="reason"
        placeholder={`Motif (ex. demande de ${schoolName})`}
        maxLength={200}
        className="w-64 rounded-xl border px-2 py-1.5 text-sm"
        aria-label="Motif de l’intervention"
      />
      <SubmitButton>Entrer</SubmitButton>
      <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
        Annuler
      </Button>
    </form>
  );
}
