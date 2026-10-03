'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { SENDER_STATUS_LABELS, type SenderStatus } from '@/features/sms/sender-types';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Recopier la réponse de l'opérateur.
 *
 * Letexto répond par e-mail et n'offre aucun moyen de connaître l'état par
 * API : quelqu'un doit donc le saisir. Autant le dire franchement plutôt que
 * de laisser croire à une mise à jour automatique.
 */
export function SenderStatusForm({ action, status }: { action: Action; status: SenderStatus }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [choix, setChoix] = useState<SenderStatus>(status);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <p className="text-sm text-[color:var(--muted-foreground)]">
        L’opérateur répond par e-mail. Reportez ici sa réponse&nbsp;: rien ne se met à jour tout seul.
      </p>

      <div className="space-y-2">
        {(['REQUESTED', 'APPROVED', 'REJECTED'] as SenderStatus[]).map((s) => (
          <label key={s} className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm" style={{ backgroundColor: 'var(--surface)' }}>
            <input
              type="radio"
              name="status"
              value={s}
              checked={choix === s}
              onChange={() => setChoix(s)}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-semibold">{SENDER_STATUS_LABELS[s].title}</span>
              <br />
              <span className="text-xs text-[color:var(--muted-foreground)]">{SENDER_STATUS_LABELS[s].hint}</span>
            </span>
          </label>
        ))}
      </div>

      {choix === 'REJECTED' ? (
        <div className="space-y-1">
          <label className="text-xs font-medium" htmlFor="rejection">
            Motif du refus, tel que l’opérateur l’a écrit
          </label>
          <textarea id="rejection" name="rejectionReason" rows={2} className="w-full rounded-xl border px-2 py-1.5 text-sm" />
        </div>
      ) : null}

      <SubmitButton>Enregistrer la réponse</SubmitButton>
    </form>
  );
}
