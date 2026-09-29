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

export function PeriodCreateForm({
  action,
  nextSequence,
  schoolTracks = [],
  defaultKind = 'TERM',
  defaultTrack = '',
  title = 'Ajouter une période',
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  nextSequence: number;
  /** Ordres de l'établissement : au-delà d'un seul, on demande qui est concerné. */
  schoolTracks?: string[];
  /** Onglet Semestres : on propose d'emblée un semestre de la formation professionnelle. */
  defaultKind?: 'TERM' | 'SEMESTER' | 'QUARTER';
  defaultTrack?: string;
  title?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const choices = trackChoices(schoolTracks);
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">{title}</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" required placeholder={defaultKind === 'SEMESTER' ? '1er semestre' : '1er trimestre'} />
            </Field>
            <Field label="Rang" htmlFor="sequence" required errors={err.sequence}>
              <Input id="sequence" name="sequence" type="number" min="1" defaultValue={String(nextSequence)} required />
            </Field>
          </div>
          <Field label="Type" htmlFor="kind" errors={err.kind}>
            <Select id="kind" name="kind" defaultValue={defaultKind}>
              <option value="TERM">Trimestre</option>
              <option value="SEMESTER">Semestre</option>
              <option value="QUARTER">Quadrimestre</option>
            </Select>
          </Field>
          {choices.length > 1 ? (
            <Field label="Ordre concerné" htmlFor={'period-track'} errors={err.track} hint="Le technique et le professionnel fonctionnent par semestres, le général par trimestres.">
              <Select id={'period-track'} name="track" defaultValue={defaultTrack}>
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Début" htmlFor="startsOn" required errors={err.startsOn}>
              <Input id="startsOn" name="startsOn" type="date" required />
            </Field>
            <Field label="Fin" htmlFor="endsOn" required errors={err.endsOn}>
              <Input id="endsOn" name="endsOn" type="date" required />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isGradingPeriod" defaultChecked className="size-4" />
            Période de notation (bulletin)
          </label>
          <SubmitButton size="sm">Ajouter</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
