'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { ANNUAL_PRESET_LABELS, presetWeights, weightOf, type PeriodWeights } from '@/features/reporting/config';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Comment se fabrique la moyenne annuelle.
 *
 * Les poids sont rangés par RANG de période, pas par identifiant : un
 * établissement qui découpe en trimestres pour le général et en semestres pour
 * le technique partage le même réglage, et une nouvelle année n'a rien à
 * recopier.
 */
export function PeriodWeightsForm({
  action,
  weights,
  periodCount,
  periodNames,
}: {
  action: Action;
  weights: PeriodWeights;
  periodCount: number;
  periodNames: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [preset, setPreset] = useState<'EQUAL' | 'FIRST_HALF' | 'CUSTOM'>(() => {
    const egal = presetWeights('EQUAL', periodCount);
    const moitie = presetWeights('FIRST_HALF', periodCount);
    const meme = (a: PeriodWeights) =>
      Array.from({ length: periodCount }, (_, i) => i + 1).every((r) => weightOf(weights, r) === weightOf(a, r));
    if (meme(egal)) return 'EQUAL';
    if (meme(moitie)) return 'FIRST_HALF';
    return 'CUSTOM';
  });
  const [libres, setLibres] = useState<string[]>(() =>
    Array.from({ length: periodCount }, (_, i) => String(weightOf(weights, i + 1)).replace('.', ',')),
  );

  const apercu = (): string => {
    const w = preset === 'CUSTOM' ? libres.map((v) => Number(v.replace(',', '.')) || 0) : undefined;
    const poids = Array.from({ length: periodCount }, (_, i) =>
      w ? w[i]! : weightOf(presetWeights(preset as 'EQUAL' | 'FIRST_HALF', periodCount), i + 1),
    );
    const total = poids.reduce((a, b) => a + b, 0);
    const haut = poids.map((p, i) => (p === 1 ? `${i + 1}ᵉ` : `${p} × ${i + 1}ᵉ`)).join(' + ');
    return `Moyenne annuelle = (${haut}) ÷ ${total}`;
  };

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Comment se calcule la moyenne annuelle</p>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Elle n’apparaît que sur le dernier bulletin de l’année, où elle est mise en avant devant celle de la période.
        </p>
      </div>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="periodCount" value={periodCount} />

      <div className="space-y-2">
        {(['EQUAL', 'FIRST_HALF'] as const).map((p) => (
          <label
            key={p}
            className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <input
              type="radio"
              name="preset"
              value={p}
              checked={preset === p}
              onChange={() => setPreset(p)}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-semibold">{ANNUAL_PRESET_LABELS[p].title}</span>
              <br />
              <span className="text-xs text-[color:var(--muted-foreground)]">{ANNUAL_PRESET_LABELS[p].hint}</span>
            </span>
          </label>
        ))}

        <label
          className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          <input
            type="radio"
            name="preset"
            value="CUSTOM"
            checked={preset === 'CUSTOM'}
            onChange={() => setPreset('CUSTOM')}
            className="mt-0.5 size-4"
          />
          <span className="flex-1">
            <span className="font-semibold">Un coefficient par période</span>
            <br />
            <span className="text-xs text-[color:var(--muted-foreground)]">
              Pour tout autre usage. Un coefficient ne peut pas être nul&nbsp;: la période disparaîtrait du calcul.
            </span>
            <span className="mt-2 flex flex-wrap gap-2" hidden={preset !== 'CUSTOM'}>
              {Array.from({ length: periodCount }, (_, i) => (
                <span key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="text-[color:var(--muted-foreground)]">{periodNames[i] ?? `Période ${i + 1}`}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    name={`weight-${i + 1}`}
                    value={libres[i] ?? '1'}
                    onChange={(e) => setLibres((l) => l.map((v, j) => (i === j ? e.target.value : v)))}
                    className="w-14 rounded-xl border px-2 py-1 text-sm"
                    aria-label={`Coefficient de ${periodNames[i] ?? `la période ${i + 1}`}`}
                  />
                </span>
              ))}
            </span>
          </span>
        </label>
      </div>

      <p className="rounded-xl border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--surface)' }}>
        {apercu()}
      </p>

      <SubmitButton>Enregistrer</SubmitButton>
    </form>
  );
}
