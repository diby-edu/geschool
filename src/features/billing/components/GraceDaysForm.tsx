'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/** Délai de grâce après expiration d'un abonnement (seul réglage restant du paiement hors ligne). */
export function GraceDaysForm({ action, graceDays }: { action: (p: FormState, fd: FormData) => Promise<FormState>; graceDays: number }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <label className="flex flex-wrap items-center gap-2 text-sm font-medium" htmlFor="graceDays">
        Délai de grâce après expiration
        <input id="graceDays" name="graceDays" type="number" min={0} max={90} defaultValue={graceDays} className="w-24 rounded-xl border px-2 py-1.5 text-sm" />
        jours
      </label>
      <p className="text-xs text-[color:var(--muted-foreground)]">
        Passé ce délai sans paiement, l’accès de toute l’école est coupé jusqu’au paiement.
      </p>
      <SubmitButton size="sm">Enregistrer</SubmitButton>
    </form>
  );
}
