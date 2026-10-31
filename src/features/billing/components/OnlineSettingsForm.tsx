'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Pack = { quantity: number; price: number };

/**
 * Paiement en ligne (0157), côté plateforme : les frais payés en plus par
 * l'école, et les packs de SMS proposés (nombre, prix).
 */
export function OnlineSettingsForm({
  action,
  feePct,
  packs,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  feePct: number;
  packs: Pack[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [rows, setRows] = useState<Pack[]>(packs.length ? packs : [{ quantity: 500, price: 7500 }]);
  const set = (i: number, k: keyof Pack, v: string) => setRows((r) => r.map((p, j) => (j === i ? { ...p, [k]: Math.round(Number(v) || 0) } : p)));

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="onlineFeePct">
          Frais payés par l’école
        </label>
        <div className="flex items-center gap-2 text-sm">
          <input
            id="onlineFeePct"
            name="onlineFeePct"
            type="number"
            min={0}
            max={20}
            step={0.1}
            defaultValue={feePct}
            className="w-24 rounded-xl border px-2 py-1.5 text-sm"
          />
          %
        </div>
        <p className="text-xs text-[color:var(--muted-foreground)]">Ajoutés au montant, pour couvrir les frais de PayDunya (ils varient selon l’opérateur).</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Packs de SMS proposés aux écoles</p>
        <input type="hidden" name="smsPacks" value={JSON.stringify(rows)} />
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[color:var(--muted-foreground)]">
              <th className="py-1 pr-3">Nombre de SMS</th>
              <th className="py-1 pr-3">Prix (F)</th>
              <th className="py-1 pr-3">Prix par SMS</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={i}>
                <td className="py-1 pr-3">
                  <input type="number" min={1} max={100000} value={p.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} className="w-28 rounded-xl border px-2 py-1" />
                </td>
                <td className="py-1 pr-3">
                  <input type="number" min={1} value={p.price} onChange={(e) => set(i, 'price', e.target.value)} className="w-32 rounded-xl border px-2 py-1" />
                </td>
                <td className="py-1 pr-3 text-[color:var(--muted-foreground)]">{p.quantity > 0 ? `${(p.price / p.quantity).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} F` : '—'}</td>
                <td className="py-1 text-right">
                  <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="text-xs text-[color:var(--color-danger)] hover:underline">
                    retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button type="button" variant="ghost" size="sm" onClick={() => setRows((r) => [...r, { quantity: 1000, price: 15000 }])}>
          + ajouter un pack
        </Button>
      </div>
      <SubmitButton>Enregistrer</SubmitButton>
    </form>
  );
}
