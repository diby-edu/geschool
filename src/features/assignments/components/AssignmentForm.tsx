'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Opt = { id: string; name: string };

export function AssignmentForm({
  action,
  teachers,
  subjects,
  classes,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  teachers: Opt[];
  subjects: Opt[];
  classes: Opt[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Nouvelle affectation</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Classe" htmlFor="classId" required errors={err.classId}>
              <Select id="classId" name="classId" required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Matiere" htmlFor="subjectId" required errors={err.subjectId}>
              <Select id="subjectId" name="subjectId" required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Enseignant" htmlFor="teacherId" required errors={err.teacherId}>
              <Select id="teacherId" name="teacherId" required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Volume hebdomadaire (min)" htmlFor="weeklyMinutes" errors={err.weeklyMinutes} hint="Ex. 240 = 4 h">
            <Input id="weeklyMinutes" name="weeklyMinutes" type="number" min="0" step="5" defaultValue="0" className="max-w-40" />
          </Field>

          <SubmitButton size="sm">Affecter</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
