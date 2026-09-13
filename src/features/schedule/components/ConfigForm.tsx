'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { DayHour, BreakInput } from '@/features/schedule/schemas';

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

const BREAK_ROWS: { key: string; defaultLabel: string; defaultStart: string; defaultEnd: string }[] = [
  { key: 'break1', defaultLabel: 'Récréation', defaultStart: '10:00', defaultEnd: '10:20' },
  { key: 'break2', defaultLabel: 'Pause déjeuner', defaultStart: '12:30', defaultEnd: '13:30' },
];

export function ConfigForm({
  action,
  defaults,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: { workingDays: number[]; dayHours: DayHour[]; slotMinutes: number; breaks?: BreakInput[] };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const hoursByDay = new Map(defaults.dayHours.map((h) => [h.day, h]));
  const existingBreaks = defaults.breaks ?? [];

  // Cases cochees : pilote quels jours affichent leurs deux champs d'horaire.
  const [checked, setChecked] = useState<Set<number>>(new Set(defaults.workingDays));
  // Pauses actives : jusqu'a deux, appliquees chaque jour travaille a la meme heure.
  const [breaksOn, setBreaksOn] = useState<Set<number>>(new Set(existingBreaks.map((_, i) => i)));

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

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-medium">Pauses</legend>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Récréation, pause déjeuner… appliquées chaque jour travaillé, à la même heure. Aucun cours n&apos;y est placé.
            </p>
            <div className="space-y-2">
              {BREAK_ROWS.map((row, i) => {
                const isOn = breaksOn.has(i);
                const existing = existingBreaks[i];
                return (
                  <div
                    key={row.key}
                    className="flex flex-wrap items-center gap-3 rounded-[--radius-card] border px-3 py-2.5"
                    style={{ backgroundColor: isOn ? 'var(--color-brand-muted)' : 'transparent' }}
                  >
                    <label className="flex w-40 shrink-0 items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() =>
                          setBreaksOn((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                        className="size-4"
                      />
                      <input type="text" name={`${row.key}_label`} defaultValue={existing?.label ?? row.defaultLabel} className="w-28 border-b bg-transparent text-sm" />
                    </label>
                    {isOn ? (
                      <>
                        <input type="hidden" name={`${row.key}_on`} value="1" />
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            name={`${row.key}_start`}
                            defaultValue={existing?.start ?? row.defaultStart}
                            required
                            className="h-9 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm"
                            aria-label={`Début — ${row.defaultLabel}`}
                          />
                          <span className="text-sm text-[color:var(--muted-foreground)]">à</span>
                          <input
                            type="time"
                            name={`${row.key}_end`}
                            defaultValue={existing?.end ?? row.defaultEnd}
                            required
                            className="h-9 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm"
                            aria-label={`Fin — ${row.defaultLabel}`}
                          />
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-[color:var(--muted-foreground)]">Aucune</span>
                    )}
                  </div>
                );
              })}
            </div>
            {err.breaks ? <p className="mt-1 text-xs text-[color:var(--color-danger)]">{err.breaks.join(' ')}</p> : null}
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
