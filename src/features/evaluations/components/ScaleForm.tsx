'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { ROUNDING_MODES } from '@/features/evaluations/schemas';
import type { FormState } from '@/lib/forms';
import type { ScaleRow } from '@/features/evaluations/config';

/**
 * Le bareme : sur combien on note, et a partir de quand c'est reussi.
 *
 * Les mots sont ceux d'un directeur, pas d'un informaticien : « Code »,
 * « Seuil reussite », « Decimales » ne disent rien a qui veut simplement
 * noter sur 20 avec la moyenne a 10. Le code se deduit du nom, et une phrase
 * recapitule en clair ce que les champs decident.
 */

const ROUNDING_LABEL: Record<string, string> = {
  NONE: 'Aucun — la note reste telle quelle',
  HALF_UP: 'Au plus proche (9,46 → 9,5)',
  NEAREST_HALF: 'Au demi-point (9,46 → 9,5)',
  NEAREST_QUARTER: 'Au quart de point (9,46 → 9,5)',
  FLOOR: 'Vers le bas (9,46 → 9,4)',
  CEIL: 'Vers le haut (9,46 → 9,5)',
};

const ROUNDING_COURT: Record<string, string> = {
  NONE: 'sans arrondi',
  HALF_UP: 'arrondies au plus proche',
  NEAREST_HALF: 'arrondies au demi-point',
  NEAREST_QUARTER: 'arrondies au quart de point',
  FLOOR: 'arrondies vers le bas',
  CEIL: 'arrondies vers le haut',
};

const nb = (v: string, defaut: number) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : defaut;
};

export function ScaleForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: ScaleRow;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const g = (k: string, d: string | number | boolean = '') =>
    v[k] !== undefined ? v[k] : defaults ? String((defaults as unknown as Record<string, unknown>)[k] ?? d) : String(d);

  const [kind, setKind] = useState(g('kind', 'NUMERIC'));
  const [min, setMin] = useState(g('min_score', 0));
  const [max, setMax] = useState(g('max_score', 20));
  const [passing, setPassing] = useState(g('passing_score', 10));
  const [decimals, setDecimals] = useState(g('decimals', 2));
  const [rounding, setRounding] = useState(g('rounding', 'HALF_UP'));

  const d = nb(decimals, 2);
  const resume =
    kind === 'LETTER'
      ? 'Notes en lettres (A, B, C…). Les correspondances chiffrées se règlent ensuite, bande par bande.'
      : `Notes de ${nb(min, 0)} à ${nb(max, 20)}, réussite à partir de ${nb(passing, 10)}, ` +
        `${d === 0 ? 'sans chiffre après la virgule' : `${d} chiffre${d > 1 ? 's' : ''} après la virgule`}, ` +
        `${ROUNDING_COURT[rounding] ?? ''}.`;

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field
        label="Nom du barème"
        htmlFor="name"
        required
        errors={err.name}
        hint="Ce que vous diriez à haute voix : « Notes sur 20 », « Appréciation A à E »."
      >
        <Input id="name" name="name" defaultValue={g('name')} required maxLength={120} placeholder="Notes sur 20" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Forme des notes" htmlFor="kind" errors={err.kind}>
          <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="NUMERIC">Chiffrée (12,5)</option>
            <option value="LETTER">En lettres (A, B, C)</option>
          </Select>
        </Field>
        <Field label="Note la plus basse" htmlFor="minScore" errors={err.minScore}>
          <Input
            id="minScore"
            name="minScore"
            type="number"
            step="0.5"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
        </Field>
        <Field label="Note la plus haute" htmlFor="maxScore" errors={err.maxScore}>
          <Input
            id="maxScore"
            name="maxScore"
            type="number"
            step="0.5"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </Field>
        <Field label="Moyenne" htmlFor="passingScore" errors={err.passingScore} hint="À partir d’ici, c’est réussi.">
          <Input
            id="passingScore"
            name="passingScore"
            type="number"
            step="0.5"
            value={passing}
            onChange={(e) => setPassing(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Chiffres après la virgule"
          htmlFor="decimals"
          errors={err.decimals}
          hint="2 donne 11,25 ; 0 donne 11."
        >
          <Input
            id="decimals"
            name="decimals"
            type="number"
            min="0"
            max="4"
            value={decimals}
            onChange={(e) => setDecimals(e.target.value)}
          />
        </Field>
        <Field label="Arrondi des moyennes" htmlFor="rounding" errors={err.rounding}>
          <Select id="rounding" name="rounding" value={rounding} onChange={(e) => setRounding(e.target.value)}>
            {ROUNDING_MODES.map((r) => (
              <option key={r} value={r}>
                {ROUNDING_LABEL[r] ?? r}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="isDefault" defaultChecked={defaults?.is_default ?? false} className="mt-0.5 size-4" />
            <span>
              Barème habituel
              <span className="block text-xs text-[color:var(--muted-foreground)]">
                Proposé d’office à chaque nouvelle évaluation.
              </span>
            </span>
          </label>
        </div>
      </div>

      <p className="rounded-xl border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--surface)' }}>
        {resume}
      </p>

      <SubmitButton variant="secondary" size="sm">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
