'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import type { FormState } from '@/lib/forms';

/**
 * Page Abonnement (maquette docs/maquettes/abonnement-ecole.html) : tous les
 * modules présentés comme sur la page d'accueil, à cocher (renouveler ou
 * souscrire), et une barre en bas qui suit le total et paie en ligne.
 */

export type PickerModule = {
  code: string;
  name: string;
  icon: string;
  desc: string;
  benefits: string[];
  price: number;
  /** Couleurs de la carte (dégradé). */
  a: string;
  b: string;
  subscribed: boolean;
  endsOn: string | null;
  expired: boolean;
  demo: boolean;
};

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;
const jour = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR');

function PayButton({ total, disabled }: { total: number; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-xl px-5 py-2.5 text-sm font-extrabold disabled:opacity-50"
      style={{ background: '#f2a71b', color: '#2b1a00' }}
    >
      {pending ? 'Ouverture de PayDunya…' : `Payer ${money(total)} en ligne`}
    </button>
  );
}

export function ModulePicker({
  modules,
  canPay,
  online,
  feePct,
  manualHref,
  action,
}: {
  modules: PickerModule[];
  canPay: boolean;
  online: boolean;
  feePct: number;
  manualHref: string;
  action: (p: FormState, fd: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [chosen, setChosen] = useState<string[]>(modules.filter((m) => m.subscribed).map((m) => m.code));
  const picked = modules.filter((m) => chosen.includes(m.code));
  const amount = picked.reduce((n, m) => n + m.price, 0);
  const fee = Math.ceil((amount * feePct) / 100);
  const toggle = (code: string) => setChosen((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]));

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((m) => {
          const on = chosen.includes(m.code);
          return (
            <div
              key={m.code}
              className="flex flex-col overflow-hidden rounded-2xl border-2"
              style={{ borderColor: on ? 'var(--color-brand)' : 'var(--border)', background: 'var(--surface)' }}
            >
              <div className="p-4 text-white" style={{ background: `linear-gradient(135deg, ${m.a}, ${m.b})` }}>
                <div className="text-2xl" aria-hidden>
                  {m.icon}
                </div>
                <h3 className="mt-1 text-lg font-extrabold">{m.name}</h3>
                <p className="text-sm opacity-90">{m.desc}</p>
              </div>
              <div className="flex-1 p-4">
                {m.benefits.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {m.benefits.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 text-2xl font-extrabold tabular-nums">
                  {money(m.price)} <span className="text-sm font-normal text-[color:var(--muted-foreground)]">/ an</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={
                    m.subscribed && !m.expired
                      ? { background: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }
                      : m.expired
                        ? { background: 'color-mix(in srgb, var(--color-danger) 15%, transparent)', color: 'var(--color-danger)' }
                        : { background: 'var(--border)', color: 'var(--muted-foreground)' }
                  }
                >
                  {!m.subscribed
                    ? 'Pas encore souscrit'
                    : m.expired
                      ? `Échu${m.endsOn ? ` le ${jour(m.endsOn)}` : ''}`
                      : m.demo
                        ? `En démonstration${m.endsOn ? ` · jusqu’au ${jour(m.endsOn)}` : ''}`
                        : `Souscrit${m.endsOn ? ` · jusqu’au ${jour(m.endsOn)}` : ''}`}
                </span>
                {canPay ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                    <input type="checkbox" name="module" value={m.code} checked={on} onChange={() => toggle(m.code)} className="size-4" />
                    {m.subscribed ? 'Renouveler' : 'Souscrire'}
                  </label>
                ) : null}
              </div>
            </div>
          );
        })}

        <div className="flex flex-col overflow-hidden rounded-2xl border-2" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="p-4 text-white" style={{ background: 'linear-gradient(135deg, #f2a71b, #f2711b)' }}>
            <div className="text-2xl" aria-hidden>
              👨‍👩‍👧
            </div>
            <h3 className="mt-1 text-lg font-extrabold">Espace Parent</h3>
            <p className="text-sm opacity-90">Chaque famille suit la scolarité de son enfant : notes, présences, bulletins.</p>
          </div>
          <div className="flex-1 p-4">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>Notification dès qu’une absence est enregistrée</li>
              <li>Identifiants reçus par SMS</li>
            </ul>
            <p className="mt-3 text-2xl font-extrabold">
              0 F <span className="text-sm font-normal text-[color:var(--muted-foreground)]">pour l’école</span>
            </p>
            <p className="text-xs text-[color:var(--muted-foreground)]">Payé par les familles : 2 000 F par an et par famille (bientôt).</p>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm" style={{ borderColor: 'var(--border)' }}>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}>
              Inclus
            </span>
            <span className="text-xs text-[color:var(--muted-foreground)]">rien à cocher</span>
          </div>
        </div>
      </div>

      {canPay ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 text-white shadow-lg" style={{ background: '#141433' }}>
          <div>
            <div className="text-xs opacity-80">
              {picked.length === 0 ? 'Cochez les modules à payer' : `${picked.length} module(s) · année scolaire, jusqu’au 31 août`}
            </div>
            <div className="text-xl font-extrabold tabular-nums">
              {money(amount)}
              {online && fee > 0 ? (
                <span className="ml-2 text-xs font-normal opacity-80">
                  + {money(fee)} de frais de paiement en ligne ({feePct.toLocaleString('fr-FR')} %)
                </span>
              ) : null}
            </div>
          </div>
          {online ? (
            <PayButton total={amount + fee} disabled={picked.length === 0} />
          ) : (
            <Link href={manualHref} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#141433]">
              Comment payer
            </Link>
          )}
        </div>
      ) : null}
      {canPay && online ? (
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Orange Money, MTN, Moov, Wave ou carte, sur la page sécurisée de PayDunya. Autre moyen :{' '}
          <Link href={manualHref} className="underline">
            verser puis signaler la référence
          </Link>
          .
        </p>
      ) : null}
    </form>
  );
}
