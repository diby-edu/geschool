'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Rouvrir des bulletins validés.
 *
 * Volontairement en deux temps : un bouton discret, puis un motif à écrire.
 * On ne rouvre pas un document déjà signé d'un clic distrait.
 */
export function UnlockForm({ action, published }: { action: Action; published: number }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="rounded-xl border px-3 py-1.5 text-sm"
        style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
      >
        Rouvrir les bulletins validés
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-2 rounded-2xl border p-3" style={{ backgroundColor: 'var(--surface)' }}>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {published > 0 ? (
        <Alert tone="error">
          {published} bulletin(s) ont déjà été remis aux familles. Rouverts, ils compteront une rectification, et la
          mention apparaîtra sur le document réédité.
        </Alert>
      ) : null}
      <p className="text-sm">
        Les bulletins redeviendront modifiables, et devront être <strong>revalidés puis resignés</strong>.
      </p>
      <label className="block text-xs font-medium" htmlFor="unlock-reason">
        Motif — il restera inscrit sur les bulletins
      </label>
      <textarea id="unlock-reason" name="reason" rows={2} className="w-full rounded-xl border px-2 py-1.5 text-sm" />
      <div className="flex gap-2">
        <SubmitButton>Confirmer la réouverture</SubmitButton>
        <button type="button" onClick={() => setOuvert(false)} className="rounded-xl border px-3 py-1.5 text-sm">
          Annuler
        </button>
      </div>
    </form>
  );
}
