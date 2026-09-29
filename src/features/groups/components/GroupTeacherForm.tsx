'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Opt = { id: string; name: string };

/**
 * Confier le groupe à un enseignant.
 *
 * Deux professeurs peuvent se partager un même groupe, et un professeur peut
 * avoir la classe entière ET le groupe qui en sort : la base n'interdit que le
 * doublon exact (même enseignant, même matière, même groupe).
 */
export function GroupTeacherForm({
  action,
  teachers,
  subjects,
  defaultSubjectId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  teachers: Opt[];
  subjects: Opt[];
  defaultSubjectId: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid items-end gap-3 sm:grid-cols-4">
      {state.error ? (
        <div className="sm:col-span-4">
          <Alert tone="error">{state.error}</Alert>
        </div>
      ) : null}

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

      <Field label="Matière" htmlFor="teacherSubjectId" required errors={err.subjectId}>
        <Select id="teacherSubjectId" name="subjectId" required defaultValue={defaultSubjectId}>
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

      <Field label="Heures par semaine" htmlFor="weeklyMinutes" errors={err.weeklyMinutes} hint="En minutes.">
        <Input id="weeklyMinutes" name="weeklyMinutes" type="number" min="0" max="3000" step="5" defaultValue="0" />
      </Field>

      <SubmitButton variant="secondary">Ajouter</SubmitButton>
    </form>
  );
}
