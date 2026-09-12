'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { Ref } from '@/features/evaluations/refs';

type Defaults = {
  title?: string;
  subjectId?: string;
  classId?: string;
  periodId?: string;
  assessmentTypeId?: string;
  gradingScaleId?: string;
  teacherId?: string;
  assessmentDate?: string;
  maxScore?: number;
  coefficient?: number;
};

export function AssessmentForm({
  action,
  refs,
  defaults = {},
  submitLabel = 'Créer l’évaluation',
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  refs: { subjects: Ref[]; classes: Ref[]; periods: Ref[]; types: Ref[]; scales: Ref[]; teachers: Ref[] };
  defaults?: Defaults;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = { ...defaults, ...(state.values ?? {}) } as Record<string, string | number | undefined>;
  const val = (k: string) => (v[k] === undefined || v[k] === null ? '' : String(v[k]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <Field label="Titre" htmlFor="title" required errors={err.title}>
            <Input id="title" name="title" defaultValue={val('title')} required maxLength={160} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Matière" htmlFor="subjectId" required errors={err.subjectId}>
              <Select id="subjectId" name="subjectId" defaultValue={val('subjectId')} required>
                <option value="">—</option>
                {refs.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Classe" htmlFor="classId" required errors={err.classId}>
              <Select id="classId" name="classId" defaultValue={val('classId')} required>
                <option value="">—</option>
                {refs.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Période" htmlFor="periodId" required errors={err.periodId}>
              <Select id="periodId" name="periodId" defaultValue={val('periodId')} required>
                <option value="">—</option>
                {refs.periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Type" htmlFor="assessmentTypeId" required errors={err.assessmentTypeId}>
              <Select id="assessmentTypeId" name="assessmentTypeId" defaultValue={val('assessmentTypeId')} required>
                <option value="">—</option>
                {refs.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Barème" htmlFor="gradingScaleId" required errors={err.gradingScaleId}>
              <Select id="gradingScaleId" name="gradingScaleId" defaultValue={val('gradingScaleId')} required>
                <option value="">—</option>
                {refs.scales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Enseignant" htmlFor="teacherId" errors={err.teacherId}>
              <Select id="teacherId" name="teacherId" defaultValue={val('teacherId')}>
                <option value="">— Aucun —</option>
                {refs.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" htmlFor="assessmentDate" required errors={err.assessmentDate}>
              <Input id="assessmentDate" name="assessmentDate" type="date" defaultValue={val('assessmentDate') || today} required />
            </Field>
            <Field label="Note maximale" htmlFor="maxScore" required errors={err.maxScore}>
              <Input id="maxScore" name="maxScore" type="number" min="0.5" step="0.5" defaultValue={val('maxScore') || '20'} required />
            </Field>
            <Field label="Coefficient" htmlFor="coefficient" required errors={err.coefficient}>
              <Input id="coefficient" name="coefficient" type="number" min="0.01" step="0.01" defaultValue={val('coefficient') || '1'} required />
            </Field>
          </div>

          <fieldset className="space-y-2 rounded-[--radius-card] border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isEliminatory" defaultChecked={val('isEliminatory') === 'true'} className="size-4" />
              Note éliminatoire
            </label>
            <Field label="Seuil éliminatoire" htmlFor="eliminatoryThreshold" errors={err.eliminatoryThreshold}>
              <Input id="eliminatoryThreshold" name="eliminatoryThreshold" type="number" min="0" step="0.5" defaultValue={val('eliminatoryThreshold')} />
            </Field>
          </fieldset>

          <SubmitButton>{submitLabel}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
