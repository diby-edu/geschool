'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Dates de la période de calcul des moyennes. Elle se ferme d'elle-même à la date de
 * fin ; l'ouverture et la fermeture manuelles se font avec les boutons voisins.
 *
 * Le raccourci « Toute la période » évite de ressaisir deux dates qu'on a déjà
 * sous les yeux : c'est le réglage de départ le plus courant, et il s'ajuste
 * ensuite en deux clics.
 */
export function GradingWindowForm({
  action,
  defaultStarts,
  defaultEnds,
  min,
  max,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultStarts: string | null;
  defaultEnds: string | null;
  min: string;
  max: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = state.values ?? {};
  const [starts, setStarts] = useState<string>(v.gradingStarts ?? defaultStarts ?? '');
  const [ends, setEnds] = useState<string>(v.gradingEnds ?? defaultEnds ?? '');
  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Début du calcul" htmlFor="gradingStarts">
          <Input
            id="gradingStarts"
            name="gradingStarts"
            type="date"
            min={min}
            max={max}
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
          />
        </Field>
        <Field label="Fin (fermeture automatique)" htmlFor="gradingEnds">
          <Input
            id="gradingEnds"
            name="gradingEnds"
            type="date"
            min={min}
            max={max}
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
          />
        </Field>
        <SubmitButton size="sm">Enregistrer les dates</SubmitButton>
        <button
          type="button"
          onClick={() => {
            setStarts(min);
            setEnds(max);
          }}
          className="h-9 rounded-[--radius-card] border px-3 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          Toute la période
        </button>
      </div>
    </form>
  );
}
