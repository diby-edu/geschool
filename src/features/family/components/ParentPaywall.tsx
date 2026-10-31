'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import type { FormState } from '@/lib/forms';
import { payParentAccessAction } from '../parent-payment';

type Kid = { id: string; name: string; className: string | null; unlocked: boolean; paidBy: string | null; paidAt: string | null; validUntil: string | null };

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '');

function PayButton({ total, disabled }: { total: number; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="block w-full rounded-xl px-4 py-3 text-center text-sm font-extrabold text-white disabled:opacity-50"
      style={{ background: '#f2711b' }}
    >
      {pending ? 'Ouverture de la page de paiement…' : `Payer ${money(total)}`}
    </button>
  );
}

/**
 * L'écran de paiement de l'Espace Parent (maquette espace-parent.html, écrans A
 * et B). Les enfants encore fermés sont cochés d'avance ; un enfant déjà payé
 * par un autre tuteur apparaît payé, sans case. Le total suit les cases.
 */
export function ParentPaywall({ slug, kids, price }: { slug: string; kids: Kid[]; price: number }) {
  const [state, action] = useActionState<FormState, FormData>(payParentAccessAction.bind(null, slug), {});
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(kids.filter((k) => !k.unlocked).map((k) => k.id)));
  const total = price * chosen.size;
  const end = new Date().getMonth() >= 7 ? new Date().getFullYear() + 1 : new Date().getFullYear();

  return (
    <form action={action} className="space-y-3">
      <div className="rounded-2xl border px-4 py-5 text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="text-3xl" aria-hidden>
          🔒
        </div>
        <p className="mt-1 font-bold">L’Espace Parent n’est pas encore activé</p>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Activez-le pour suivre vos enfants : absences, moyennes, bulletins, emploi du temps et notifications.
        </p>
      </div>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <ul className="space-y-2">
        {kids.map((k) =>
          k.unlocked ? (
            <li key={k.id} className="flex items-start gap-3 rounded-2xl border px-3.5 py-3" style={{ borderColor: 'color-mix(in srgb, var(--color-success) 35%, transparent)', background: 'color-mix(in srgb, var(--color-success) 7%, transparent)' }}>
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md text-xs font-bold text-white" style={{ background: 'var(--color-success)' }}>
                ✓
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <b>{k.name}</b>
                <span className="block text-xs text-[color:var(--muted-foreground)]">
                  {k.className ?? 'Classe non renseignée'} · {k.paidBy ? `payé par ${k.paidBy} le ${day(k.paidAt)}` : 'activé'}
                  {k.validUntil ? ` · jusqu’au ${day(k.validUntil)}` : ''}
                </span>
              </span>
            </li>
          ) : (
            <li key={k.id}>
              <label
                className="flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3"
                style={chosen.has(k.id) ? { borderColor: '#f2711b', borderWidth: 2, background: '#fff8f2' } : { borderColor: 'var(--border)' }}
              >
                <input
                  type="checkbox"
                  name="enfant"
                  value={k.id}
                  checked={chosen.has(k.id)}
                  onChange={() =>
                    setChosen((c) => {
                      const n = new Set(c);
                      if (n.has(k.id)) n.delete(k.id);
                      else n.add(k.id);
                      return n;
                    })
                  }
                  className="mt-0.5 size-5 accent-[#f2711b]"
                />
                <span className="min-w-0 flex-1 text-sm" style={chosen.has(k.id) ? { color: '#141433' } : undefined}>
                  <b>{k.name}</b>
                  <span className="block text-xs text-[color:var(--muted-foreground)]">{k.className ?? 'Classe non renseignée'}</span>
                </span>
                <span className="text-sm font-extrabold" style={chosen.has(k.id) ? { color: '#141433' } : undefined}>
                  {money(price)}
                </span>
              </label>
            </li>
          ),
        )}
      </ul>

      <div className="flex justify-between border-t border-dashed pt-2 text-sm" style={{ borderColor: 'var(--border)' }}>
        <span>
          {chosen.size} enfant{chosen.size > 1 ? 's' : ''} · jusqu’au 31 août {end}
        </span>
        <b className="text-lg">{money(total)}</b>
      </div>
      <PayButton total={total} disabled={chosen.size === 0} />
      <p className="text-center text-xs text-[color:var(--muted-foreground)]">
        Orange Money, MTN, Moov, Wave ou carte · page sécurisée PayDunya. Un seul paiement par enfant, pour tous ses tuteurs.
      </p>
    </form>
  );
}
