'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Accorder un complement de SMS pour un mois.
 *
 * A zero, le complement est retire : l'ecole revient au quota de sa formule.
 */
export function SmsGrantForm({
  action,
  month,
  current,
  price,
}: {
  action: Action;
  /** Le mois a crediter, au format AAAA-MM-01. */
  month: string;
  /** Ce qui est deja accorde pour ce mois. */
  current: number;
  /** Prix d'un SMS, pour chiffrer le complement. */
  price: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [quantite, setQuantite] = useState(String(current));

  const n = Number(quantite.replace(/\s/g, '')) || 0;
  const montant = Math.round(n * price);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="month" value={month} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="grant-qty">
            SMS accordés en plus
          </label>
          <input
            id="grant-qty"
            name="quantity"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            inputMode="numeric"
            className="w-32 rounded-xl border px-2 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="grant-reason">
            Motif
          </label>
          <input
            id="grant-reason"
            name="reason"
            placeholder="Paiement du 4 octobre"
            className="w-64 rounded-xl border px-2 py-1.5 text-sm"
          />
        </div>
        <SubmitButton>Enregistrer</SubmitButton>
      </div>

      <p className="text-xs text-[color:var(--muted-foreground)]">
        Pour le mois de{' '}
        <strong>
          {new Date(`${month}T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        </strong>
        .{' '}
        {n === 0 ? (
          <>À zéro, le complément est retiré : l’établissement revient au quota de sa formule.</>
        ) : price > 0 ? (
          <>
            Soit <strong>{montant.toLocaleString('fr-FR')}</strong> au prix de {price} par SMS. Confirmez le paiement
            avant d’accorder.
          </>
        ) : (
          <>Le SMS est à zéro : ce complément ne coûte rien à l’établissement.</>
        )}
      </p>
    </form>
  );
}
