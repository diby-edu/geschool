'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { trackChoices } from '../periods-by-track';

export type CalendarEventDefaults = { name: string; kind: string; startsOn: string; endsOn: string; blocksSchedule: boolean; track: string };

/**
 * Congé, jour férié ou fermeture (fiche de l'année) : ajout, ou modification quand
 * `defaults` est fourni (formulaire nu, placé dans la carte de l'événement).
 */
export function CalendarEventForm({
  action,
  min,
  max,
  defaults,
  idPrefix = 'cal',
  schoolTracks = [],
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  min: string;
  max: string;
  defaults?: CalendarEventDefaults | undefined;
  /** Plusieurs formulaires sur la page : des identifiants distincts. */
  idPrefix?: string;
  /** Ordres de l'établissement : les congés du technique ne sont pas ceux du général. */
  schoolTracks?: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const id = (field: string) => `${idPrefix}-${field}`;
  const choices = trackChoices(schoolTracks);

  const form = (
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom" htmlFor={id('name')} required errors={err.name}>
              <Input id={id('name')} name="name" required placeholder="Fête du Travail" defaultValue={defaults?.name} />
            </Field>
            <Field label="Type" htmlFor={id('kind')} errors={err.kind}>
              <Select id={id('kind')} name="kind" defaultValue={defaults?.kind ?? 'PUBLIC_HOLIDAY'}>
                <option value="PUBLIC_HOLIDAY">Jour férié</option>
                <option value="VACATION">Congés</option>
                <option value="CLOSURE">Fermeture de l’établissement</option>
                <option value="EXAM">Examens</option>
                <option value="EVENT">Événement</option>
              </Select>
            </Field>
          </div>
          {choices.length > 1 ? (
            <Field label="Ordre concerné" htmlFor={id('track')} errors={err.track} hint="Les congés du technique et du professionnel ne tombent pas aux mêmes dates que ceux du général.">
              <Select id={id('track')} name="track" defaultValue={defaults?.track ?? ''}>
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Du" htmlFor={id('starts')} required errors={err.startsOn}>
              <Input id={id('starts')} name="startsOn" type="date" min={min} max={max} required defaultValue={defaults?.startsOn} />
            </Field>
            <Field label="Au (inclus)" htmlFor={id('ends')} required errors={err.endsOn}>
              <Input id={id('ends')} name="endsOn" type="date" min={min} required defaultValue={defaults?.endsOn} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="blocksSchedule" defaultChecked={defaults?.blocksSchedule ?? true} className="size-4" />
            Pas de cours ces jours-là (aucun appel attendu)
          </label>
          <SubmitButton size="sm">{defaults ? 'Enregistrer' : 'Ajouter'}</SubmitButton>
        </form>
  );

  if (defaults) return form;
  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter un congé ou un jour férié</p>
        {form}
      </CardContent>
    </Card>
  );
}
