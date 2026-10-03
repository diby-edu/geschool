'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { DECISION_CODES, DECISION_HINTS, type DecisionCode, type DecisionOption } from '@/features/reporting/config';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type Ligne = { code: string; label: string; min: string };

/**
 * Les décisions que le conseil peut prendre en fin d'année.
 *
 * Le seuil est FACULTATIF : il ne fait que pré-cocher la décision la plus
 * probable. Le conseil reste souverain, et une décision sans seuil (exclusion,
 * report) ne se propose jamais toute seule.
 */
export function DecisionsForm({ action, decisions }: { action: Action; decisions: DecisionOption[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [lignes, setLignes] = useState<Ligne[]>(() =>
    decisions.map((d) => ({ code: d.code, label: d.label, min: d.min === null ? '' : String(d.min).replace('.', ',') })),
  );

  const maj = (i: number, champ: keyof Ligne, valeur: string) =>
    setLignes((l) => l.map((ligne, j) => (i === j ? { ...ligne, [champ]: valeur } : ligne)));

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Décisions de fin d’année</p>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Ce que le conseil peut écrire sur le dernier bulletin. Ajoutez, retirez, reformulez : cette liste est la
          vôtre. Deux raccourcis dans le texte&nbsp;: <code>{'{niveau}'}</code> devient la classe d’arrivée,{' '}
          <code>{'{classe}'}</code> la classe actuelle.
        </p>
      </div>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="space-y-2">
        <div
          className="grid items-center gap-2 px-1 text-xs text-[color:var(--muted-foreground)]"
          style={{ gridTemplateColumns: '1fr 210px 108px' }}
        >
          <span>Texte imprimé sur le bulletin</span>
          <span>Nature</span>
          <span>Proposée à partir de</span>
        </div>

        {lignes.map((ligne, i) => (
          <div
            key={i}
            className="grid items-center gap-2 rounded-2xl border p-2"
            style={{ backgroundColor: 'var(--surface)', gridTemplateColumns: '1fr 210px 108px' }}
          >
            <input
              type="text"
              name="label"
              value={ligne.label}
              onChange={(e) => maj(i, 'label', e.target.value)}
              placeholder="Effacer ce texte supprime la ligne"
              className="w-full rounded-xl border px-2 py-1.5 text-sm"
              aria-label={`Texte de la décision ${i + 1}`}
            />
            <select
              name="code"
              value={ligne.code}
              onChange={(e) => maj(i, 'code', e.target.value)}
              className="w-full rounded-xl border px-2 py-1.5 text-sm"
              aria-label={`Nature de la décision ${i + 1}`}
            >
              {DECISION_CODES.map((c) => (
                <option key={c} value={c}>
                  {DECISION_HINTS[c as DecisionCode]}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              name="min"
              value={ligne.min}
              onChange={(e) => maj(i, 'min', e.target.value)}
              placeholder="—"
              className="w-full rounded-xl border px-2 py-1.5 text-sm"
              aria-label={`Seuil de la décision ${i + 1}`}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setLignes((l) => [...l, { code: 'PROMOTED', label: '', min: '' }])}
          className="rounded-xl border px-3 py-1.5 text-sm"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          Ajouter une décision
        </button>
        <SubmitButton>Enregistrer</SubmitButton>
      </div>

      <p className="text-xs text-[color:var(--muted-foreground)]">
        La « nature » sert à l’application, pas à la famille&nbsp;: c’est elle qui permet de compter les passages et les
        redoublements. Le texte imprimé, lui, vous appartient.
      </p>
    </form>
  );
}
