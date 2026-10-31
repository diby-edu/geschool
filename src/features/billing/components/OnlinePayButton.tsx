'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { FormState } from '@/lib/forms';

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;

function Submit({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Ouverture de PayDunya…' : `Payer ${money(total)} en ligne`}
    </Button>
  );
}

/**
 * « Payer en ligne » (PayDunya, 0157) : le détail (montant, frais payés par
 * l'école, total), les moyens acceptés, puis l'envoi vers la page de PayDunya.
 */
export function OnlinePayButton({
  action,
  amount,
  fee,
  feePct,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  amount: number;
  fee: number;
  feePct: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Montant</span>
          <span className="tabular-nums">{money(amount)}</span>
        </div>
        {fee > 0 ? (
          <div className="flex justify-between text-[color:var(--muted-foreground)]">
            <span>Frais de paiement en ligne ({feePct.toLocaleString('fr-FR')} %)</span>
            <span className="tabular-nums">{money(fee)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t pt-1 font-bold" style={{ borderColor: 'var(--border)' }}>
          <span>Total à payer</span>
          <span className="tabular-nums">{money(amount + fee)}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
        {['Orange Money', 'MTN MoMo', 'Moov Money', 'Wave', 'Carte bancaire'].map((m) => (
          <span key={m} className="rounded-lg border px-2 py-0.5" style={{ borderColor: 'var(--border)' }}>
            {m}
          </span>
        ))}
      </div>
      <Submit total={amount + fee} />
      <p className="text-xs text-[color:var(--muted-foreground)]">
        Vous passez sur la page sécurisée de PayDunya, vous choisissez votre moyen de paiement, puis vous revenez ici. C’est confirmé dès que PayDunya a reçu
        l’argent, et votre reçu est prêt.
      </p>
    </form>
  );
}
