'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

const DAYS = [
  { v: 1, l: 'Lundi' },
  { v: 2, l: 'Mardi' },
  { v: 3, l: 'Mercredi' },
  { v: 4, l: 'Jeudi' },
  { v: 5, l: 'Vendredi' },
  { v: 6, l: 'Samedi' },
  { v: 7, l: 'Dimanche' },
];

export function ConfigForm({
  action,
  defaults,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: { workingDays: number[]; dayStart: string; dayEnd: string; slotMinutes: number };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Jours travailles</legend>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((d) => (
                <label key={d.v} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="workingDays"
                    value={d.v}
                    defaultChecked={defaults.workingDays.includes(d.v)}
                    className="size-4"
                  />
                  {d.l}
                </label>
              ))}
            </div>
            {err.workingDays ? <p className="mt-1 text-xs text-[color:var(--color-danger)]">{err.workingDays.join(' ')}</p> : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Debut de journee" htmlFor="dayStart" required errors={err.dayStart}>
              <Input id="dayStart" name="dayStart" type="time" defaultValue={defaults.dayStart} required />
            </Field>
            <Field label="Fin de journee" htmlFor="dayEnd" required errors={err.dayEnd}>
              <Input id="dayEnd" name="dayEnd" type="time" defaultValue={defaults.dayEnd} required />
            </Field>
            <Field label="Duree d'un creneau (min)" htmlFor="slotMinutes" required errors={err.slotMinutes}>
              <Input id="slotMinutes" name="slotMinutes" type="number" min="15" step="5" defaultValue={String(defaults.slotMinutes)} required />
            </Field>
          </div>

          <p className="text-xs text-[color:var(--muted-foreground)]">
            La grille de creneaux sera generee automatiquement. Une seance pourra occuper
            plusieurs creneaux contigus.
          </p>

          <SubmitButton>Generer la grille</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
