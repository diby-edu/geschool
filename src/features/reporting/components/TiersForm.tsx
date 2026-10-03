'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import {
  DISTINCTION_CODES,
  DISTINCTION_HINTS,
  TIER_TONES,
  TIER_TONE_LABELS,
  sortTiers,
  type MentionTier,
  type Tier,
} from '@/features/reporting/config';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

type Ligne = { min: string; label: string; tone: string; code: string };

/**
 * Un jeu de paliers.
 *
 * On lit toujours du haut vers le bas, du meilleur au moins bon : c'est l'ordre
 * dans lequel l'application descend la liste pour trouver le mot à écrire.
 * Effacer le mot d'une ligne la supprime — inutile de chercher un bouton.
 */
export function TiersForm({
  action,
  tiers,
  withCode = false,
  title,
  hint,
  exemple,
}: {
  action: Action;
  tiers: Tier[] | MentionTier[];
  /** Les mentions portent en plus un code : la base n'en connaît que six. */
  withCode?: boolean;
  title: string;
  hint: string;
  exemple: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [lignes, setLignes] = useState<Ligne[]>(() =>
    sortTiers(tiers as Tier[]).map((t) => ({
      min: String(t.min).replace('.', ','),
      label: t.label,
      tone: t.tone,
      code: (t as MentionTier).code ?? 'NONE',
    })),
  );

  const majLigne = (i: number, champ: keyof Ligne, valeur: string) =>
    setLignes((l) => l.map((ligne, j) => (i === j ? { ...ligne, [champ]: valeur } : ligne)));

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-[color:var(--muted-foreground)]">{hint}</p>
      </div>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="space-y-2">
        <div
          className="grid items-center gap-2 px-1 text-xs text-[color:var(--muted-foreground)]"
          style={{ gridTemplateColumns: withCode ? '88px 1fr 118px 168px' : '88px 1fr 118px' }}
        >
          <span>À partir de</span>
          <span>On écrit</span>
          <span>Teinte</span>
          {withCode ? <span>Correspond à</span> : null}
        </div>

        {lignes.map((ligne, i) => (
          <div
            key={i}
            className="grid items-center gap-2 rounded-2xl border p-2"
            style={{
              backgroundColor: 'var(--surface)',
              gridTemplateColumns: withCode ? '88px 1fr 118px 168px' : '88px 1fr 118px',
            }}
          >
            <input
              type="text"
              inputMode="decimal"
              name="min"
              value={ligne.min}
              onChange={(e) => majLigne(i, 'min', e.target.value)}
              className="w-full rounded-xl border px-2 py-1.5 text-sm"
              aria-label={`Seuil de la ligne ${i + 1}`}
            />
            <input
              type="text"
              name="label"
              value={ligne.label}
              onChange={(e) => majLigne(i, 'label', e.target.value)}
              placeholder="Effacer ce mot supprime la ligne"
              className="w-full rounded-xl border px-2 py-1.5 text-sm"
              aria-label={`Mot de la ligne ${i + 1}`}
            />
            <select
              name="tone"
              value={ligne.tone}
              onChange={(e) => majLigne(i, 'tone', e.target.value)}
              className="w-full rounded-xl border px-2 py-1.5 text-sm"
              aria-label={`Teinte de la ligne ${i + 1}`}
            >
              {TIER_TONES.map((t) => (
                <option key={t} value={t}>
                  {TIER_TONE_LABELS[t]}
                </option>
              ))}
            </select>
            {withCode ? (
              <select
                name="code"
                value={ligne.code}
                onChange={(e) => majLigne(i, 'code', e.target.value)}
                className="w-full rounded-xl border px-2 py-1.5 text-sm"
                aria-label={`Distinction de la ligne ${i + 1}`}
              >
                {DISTINCTION_CODES.map((c) => (
                  <option key={c} value={c}>
                    {DISTINCTION_HINTS[c]}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setLignes((l) => [...l, { min: '', label: '', tone: 'neutral', code: 'NONE' }])}
          className="rounded-xl border px-3 py-1.5 text-sm"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          Ajouter un palier
        </button>
        <SubmitButton>Enregistrer</SubmitButton>
      </div>

      <p className="text-xs text-[color:var(--muted-foreground)]">{exemple}</p>
    </form>
  );
}
