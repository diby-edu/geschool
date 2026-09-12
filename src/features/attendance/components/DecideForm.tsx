'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Décision d'un justificatif : un motif partagé, deux boutons (approuver /
 * rejeter). Le bouton cliqué transmet `decision` dans le FormData (React 19).
 */
export function DecideForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {state.error ? <div className="w-full"><Alert tone="error">{state.error}</Alert></div> : null}
      <input
        type="text"
        name="comment"
        placeholder="Commentaire (facultatif)"
        maxLength={300}
        className="h-9 w-56 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm"
      />
      <SubmitButton name="decision" value="APPROVED" variant="secondary" size="sm">Approuver</SubmitButton>
      <SubmitButton name="decision" value="REJECTED" variant="ghost" size="sm">Rejeter</SubmitButton>
    </form>
  );
}
