'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { DayPlan, Pause } from '@/features/schedule/day-grid';

const DAYS = [
  { v: 1, l: 'Lundi' },
  { v: 2, l: 'Mardi' },
  { v: 3, l: 'Mercredi' },
  { v: 4, l: 'Jeudi' },
  { v: 5, l: 'Vendredi' },
  { v: 6, l: 'Samedi' },
  { v: 7, l: 'Dimanche' },
];

// Journée type d'un établissement ivoirien : matin 7 h 30 – 12 h 20, après-midi 13 h 10 – 16 h 50.
const DEFAULT_DAY = { amStart: '07:30', amEnd: '12:20', pmStart: '13:10', pmEnd: '16:50' };

const RECESS_ROWS: { key: string; defaultLabel: string; defaultStart: string; defaultEnd: string }[] = [
  { key: 'break1', defaultLabel: 'Récréation', defaultStart: '10:15', defaultEnd: '10:30' },
  { key: 'break2', defaultLabel: 'Récréation de l’après-midi', defaultStart: '15:00', defaultEnd: '15:10' },
];

const timeInput = 'h-9 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm';

/** Horaire d'un jour tel que le formulaire le présente : matin, puis après-midi facultatif. */
function toHalfDays(plan: DayPlan | undefined) {
  if (!plan) return { ...DEFAULT_DAY, afternoon: true };
  if (plan.lunchStart && plan.lunchEnd) {
    return { amStart: plan.start, amEnd: plan.lunchStart, pmStart: plan.lunchEnd, pmEnd: plan.end, afternoon: true };
  }
  return { amStart: plan.start, amEnd: plan.end, pmStart: DEFAULT_DAY.pmStart, pmEnd: DEFAULT_DAY.pmEnd, afternoon: false };
}

export function ConfigForm({
  action,
  defaults,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: { workingDays: number[]; dayHours: DayPlan[]; slotMinutes: number; breaks?: Pause[] };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const hoursByDay = new Map(defaults.dayHours.map((h) => [h.day, h]));
  const existingBreaks = defaults.breaks ?? [];

  const [checked, setChecked] = useState<Set<number>>(new Set(defaults.workingDays));
  // Jours avec cours l'après-midi (par défaut : tous, sauf ceux dont la grille n'en a pas).
  const [afternoon, setAfternoon] = useState<Set<number>>(
    new Set(DAYS.map((d) => d.v).filter((d) => toHalfDays(hoursByDay.get(d)).afternoon)),
  );
  // Grille neuve : la récréation du matin est proposée d'office.
  const [breaksOn, setBreaksOn] = useState<Set<number>>(
    new Set(defaults.dayHours.length === 0 && existingBreaks.length === 0 ? [0] : existingBreaks.map((_, i) => i)),
  );

  const flip = (set: Set<number>, v: number) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-5">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-medium">Jours travaillés : matin et après-midi</legend>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Pour chaque jour, les heures du matin et de l’après-midi. La pause déjeuner est le temps entre les deux :
              aucun cours n’y est placé. Décochez « Après-midi » pour un jour sans cours l’après-midi.
            </p>

            <div className="space-y-2">
              {DAYS.map((d) => {
                const isOn = checked.has(d.v);
                const h = toHalfDays(hoursByDay.get(d.v));
                const pmOn = afternoon.has(d.v);
                return (
                  <div
                    key={d.v}
                    className="space-y-2 rounded-[--radius-card] border px-3 py-2.5"
                    style={{ backgroundColor: isOn ? 'var(--color-brand-muted)' : 'transparent' }}
                  >
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        name="workingDays"
                        value={d.v}
                        checked={isOn}
                        onChange={() => setChecked((prev) => flip(prev, d.v))}
                        className="size-4"
                      />
                      {d.l}
                      {isOn ? null : <span className="font-normal text-[color:var(--muted-foreground)]">· Non travaillé</span>}
                    </label>
                    {isOn ? (
                      <div className="space-y-2 pl-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-24 text-sm">Matin</span>
                          <input type="time" name={`am_start_${d.v}`} defaultValue={h.amStart} required className={timeInput} aria-label={`Début du matin — ${d.l}`} />
                          <span className="text-sm text-[color:var(--muted-foreground)]">à</span>
                          <input type="time" name={`am_end_${d.v}`} defaultValue={h.amEnd} required className={timeInput} aria-label={`Fin du matin — ${d.l}`} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex w-24 items-center gap-1.5 text-sm">
                            <input type="checkbox" checked={pmOn} onChange={() => setAfternoon((prev) => flip(prev, d.v))} className="size-4" />
                            Après-midi
                          </label>
                          {pmOn ? (
                            <>
                              <input type="hidden" name={`pm_on_${d.v}`} value="1" />
                              <input type="time" name={`pm_start_${d.v}`} defaultValue={h.pmStart} required className={timeInput} aria-label={`Reprise de l’après-midi — ${d.l}`} />
                              <span className="text-sm text-[color:var(--muted-foreground)]">à</span>
                              <input type="time" name={`pm_end_${d.v}`} defaultValue={h.pmEnd} required className={timeInput} aria-label={`Fin de l’après-midi — ${d.l}`} />
                            </>
                          ) : (
                            <span className="text-sm text-[color:var(--muted-foreground)]">Pas de cours l’après-midi</span>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {err.workingDays ? <p className="mt-1 text-xs text-[color:var(--color-danger)]">{err.workingDays.join(' ')}</p> : null}
            {err.dayHours ? <p className="mt-1 text-xs text-[color:var(--color-danger)]">{err.dayHours.join(' ')}</p> : null}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-medium">Récréations</legend>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              À la même heure chaque jour travaillé. Aucun cours n’y est placé. Une récréation de l’après-midi ne
              s’applique pas aux jours sans après-midi.
            </p>
            <div className="space-y-2">
              {RECESS_ROWS.map((row, i) => {
                const isOn = breaksOn.has(i);
                const existing = existingBreaks[i];
                return (
                  <div
                    key={row.key}
                    className="flex flex-wrap items-center gap-3 rounded-[--radius-card] border px-3 py-2.5"
                    style={{ backgroundColor: isOn ? 'var(--color-brand-muted)' : 'transparent' }}
                  >
                    <label className="flex w-56 shrink-0 items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={isOn} onChange={() => setBreaksOn((prev) => flip(prev, i))} className="size-4" />
                      <input type="text" name={`${row.key}_label`} defaultValue={existing?.label ?? row.defaultLabel} className="w-44 border-b bg-transparent text-sm" />
                    </label>
                    {isOn ? (
                      <>
                        <input type="hidden" name={`${row.key}_on`} value="1" />
                        <div className="flex items-center gap-2">
                          <input type="time" name={`${row.key}_start`} defaultValue={existing?.start ?? row.defaultStart} required className={timeInput} aria-label={`Début — ${row.defaultLabel}`} />
                          <span className="text-sm text-[color:var(--muted-foreground)]">à</span>
                          <input type="time" name={`${row.key}_end`} defaultValue={existing?.end ?? row.defaultEnd} required className={timeInput} aria-label={`Fin — ${row.defaultLabel}`} />
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
            <Input id="slotMinutes" name="slotMinutes" type="number" min="15" step="5" defaultValue={String(defaults.slotMinutes)} required className="max-w-[10rem]" />
          </Field>

          <p className="text-xs text-[color:var(--muted-foreground)]">
            La grille de créneaux est générée pour chaque jour : le matin et l’après-midi sont découpés en créneaux,
            récréations et pause déjeuner exclues. Une séance peut occuper plusieurs créneaux qui se suivent.
          </p>

          <SubmitButton>Générer la grille</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
