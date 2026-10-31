'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { FormState } from '@/lib/forms';

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;
const feeOf = (amount: number, pct: number) => Math.ceil((amount * pct) / 100);

function Submit({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Ouverture de PayDunya…' : `Payer ${money(total)} en ligne`}
    </Button>
  );
}

/** Acheter un pack de SMS (PayDunya, 0157) : valables jusqu'à épuisement. */
export function SmsPackForm({
  action,
  packs,
  feePct,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  packs: { quantity: number; price: number }[];
  feePct: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [chosen, setChosen] = useState(packs[Math.min(1, packs.length - 1)]?.quantity ?? 0);
  const pack = packs.find((p) => p.quantity === chosen);
  const fee = pack ? feeOf(pack.price, feePct) : 0;
  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        {packs.map((p) => (
          <label
            key={p.quantity}
            className="cursor-pointer rounded-xl border p-3"
            style={p.quantity === chosen ? { borderColor: 'var(--color-brand)', background: 'color-mix(in srgb, var(--color-brand) 8%, transparent)' } : { borderColor: 'var(--border)' }}
          >
            <input type="radio" name="quantity" value={p.quantity} checked={p.quantity === chosen} onChange={() => setChosen(p.quantity)} className="sr-only" />
            <span className="block text-lg font-extrabold">{p.quantity.toLocaleString('fr-FR')} SMS</span>
            <span className="text-sm text-[color:var(--muted-foreground)]">{money(p.price)}</span>
          </label>
        ))}
      </div>
      {pack ? (
        <div className="max-w-sm space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Pack de {pack.quantity.toLocaleString('fr-FR')} SMS</span>
            <span className="tabular-nums">{money(pack.price)}</span>
          </div>
          {fee > 0 ? (
            <div className="flex justify-between text-[color:var(--muted-foreground)]">
              <span>Frais de paiement en ligne ({feePct.toLocaleString('fr-FR')} %)</span>
              <span className="tabular-nums">{money(fee)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-1 font-bold" style={{ borderColor: 'var(--border)' }}>
            <span>Total à payer</span>
            <span className="tabular-nums">{money(pack.price + fee)}</span>
          </div>
        </div>
      ) : null}
      {pack ? <Submit total={pack.price + fee} /> : null}
      <p className="text-xs text-[color:var(--muted-foreground)]">
        Les SMS achetés s’ajoutent à votre réserve dès que le paiement est confirmé, avec un reçu. Ils restent valables jusqu’à épuisement : ils servent quand le quota du mois
        est utilisé.
      </p>
    </form>
  );
}
