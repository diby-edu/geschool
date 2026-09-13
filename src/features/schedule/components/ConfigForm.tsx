'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { DayHour } from '@/features/schedule/schemas';

const DAYS = [
  { v: 1, l: 'Lundi' },
  { v: 2, l: 'Mardi' },
  { v: 3, l: 'Mercredi' },
  { v: 4, l: 'Jeudi' },
  { v: 5, l: 'Vendredi' },
  { v: 6, l: 'Samedi' },
  { v: 7, l: 'Dimanche' },
];

const DEFAULT_START = '07:30';
const DEFAULT_END = '13:30';

export function ConfigForm({
  action,
  defaults,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: { workingDays: number[]; dayHours: DayHour[]; slotMinutes: number };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const hoursByDay = new Map(defaults.dayHours.map((h) => [h.day, h]));

  // Cases cochees : pilote quels jours affichent leurs deux champs d'horaire.
  const [checked, setChecked] = useState<Set<number>>(new Set(defaults.workingDays));

  function toggle(day: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-5">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-medium">Jours travaillés et horaires</legend>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Chaque jour a son propre horaire — un mercredi plus court qu&apos;un lundi, par exemple.
            </p>

            <div className="space-y-2">
              {DAYS.map((d) => {
                const isOn = checked.has(d.v);
                const existing = hoursByDay.get(d.v);
                return (
                  <div
                    key={d.v}
                    className="flex flex-wrap items-center gap-3 rounded-[--radius-card] border px-3 py-2.5"
                    style={{ backgroundColor: isOn ? 'var(--color-brand-muted)' : 'transparent' }}
                  >
                    <label className="flex w-32 shrink-0 items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        name="workingDays"
                        value={d.v}
                        checked={isOn}
                        onChange={() => toggle(d.v)}
                        className="size-4"
                      />
                      {d.l}
                    </label>
                    {isOn ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          name={`start_${d.v}`}
                          defaultValue={existing?.start ?? DEFAULT_START}
                          required
                          className="h-9 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm"
                          aria-label={`Début — ${d.l}`}
                        />
                        <span className="text-sm text-[color:var(--muted-foreground)]">à</span>
                        <input
                          type="time"
                          name={`end_${d.v}`}
                          defaultValue={existing?.end ?? DEFAULT_END}
                          required
                          className="h-9 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm"
                          aria-label={`Fin — ${d.l}`}
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-[color:var(--muted-foreground)]">Non travaillé</span>
                    )}
                  </div>
                );
              })}
            </div>
            {err.workingDays ? <p className="mt-1 text-xs text-[color:var(--color-danger)]">{err.workingDays.join(' ')}</p> : null}
            {err.dayHours ? <p className="mt-1 text-xs text-[color:var(--color-danger)]">{err.dayHours.join(' ')}</p> : null}
          </fieldset>

          <Field label="Durée d'un créneau (min)" htmlFor="slotMinutes" required errors={err.slotMinutes}>
            <Input
              id="slotMinutes"
              name="slotMinutes"
              type="number"
              min="15"
              step="5"
              defaultValue={String(defaults.slotMinutes)}
              required
              className="max-w-[10rem]"
            />
          </Field>

          <p className="text-xs text-[color:var(--muted-foreground)]">
            La grille de créneaux sera générée automatiquement pour chaque jour, selon son propre horaire.
            Une séance pourra occuper plusieurs créneaux contigus.
          </p>

          <SubmitButton>Générer la grille</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
