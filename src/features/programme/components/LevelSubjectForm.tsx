'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Ajoute (ou met a jour) une matiere au programme du niveau. Choisir une
 * matiere deja presente met a jour son coefficient — l'upsert cote serveur.
 */
export function LevelSubjectForm({
  action,
  levelId,
  subjects,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  levelId: string;
  subjects: { id: string; name: string; defaultCoefficient: number }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Ajouter une matiere au programme</p>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="levelId" value={levelId} />
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <Field label="Matiere" htmlFor="subjectId" required errors={err.subjectId}>
            <Select id="subjectId" name="subjectId" required defaultValue="">
              <option value="" disabled>
                — Choisir —
              </option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Coefficient" htmlFor="coefficient" required errors={err.coefficient}>
              <Input id="coefficient" name="coefficient" type="number" step="0.5" min="0" defaultValue="1" required />
            </Field>
            <Field label="Volume hebdo (min)" htmlFor="weeklyMinutes" errors={err.weeklyMinutes} hint="Ex. 240 = 4 h">
              <Input id="weeklyMinutes" name="weeklyMinutes" type="number" min="0" step="5" defaultValue="0" />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isMandatory" defaultChecked className="size-4" />
            Matiere obligatoire
          </label>

          <SubmitButton size="sm">Ajouter au programme</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
