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

const MAX_SCORE_OPTIONS = [10, 20, 40, 50, 100];

/**
 * Formulaire "nouvelle évaluation" du tableau de bord enseignant : classe,
 * période, barème et enseignant sont déjà déterminés par le contexte (dossier
 * de classe ouvert, enseignant connecté) et n'ont donc rien à faire dans le
 * formulaire — ils partent en champs cachés. Seule la matière reste un choix
 * visible, et seulement quand l'enseignant en a plusieurs dans cette classe
 * (sinon la valeur unique est déjà connue).
 */
export function SimpleAssessmentForm({
  action,
  subjects,
  types,
  classId,
  periodId,
  gradingScaleId,
  teacherId,
  nextNumber,
  submitLabel = 'Créer l’évaluation',
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  subjects: Ref[];
  types: Ref[];
  classId: string;
  periodId: string;
  gradingScaleId: string;
  teacherId?: string;
  nextNumber?: number;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = (state.values ?? {}) as Record<string, string | undefined>;
  const val = (k: string) => v[k] ?? '';
  const today = new Date().toISOString().slice(0, 10);
  const singleSubject = subjects.length === 1 ? subjects[0] : null;

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <input type="hidden" name="classId" value={classId} />
          <input type="hidden" name="periodId" value={periodId} />
          <input type="hidden" name="gradingScaleId" value={gradingScaleId} />
          {teacherId ? <input type="hidden" name="teacherId" value={teacherId} /> : null}
          {singleSubject ? <input type="hidden" name="subjectId" value={singleSubject.id} /> : null}

          {nextNumber ? (
            <Field label="Évaluation n°" htmlFor="eval-number-display">
              <Input id="eval-number-display" value={nextNumber} disabled />
            </Field>
          ) : null}

          <Field label="Titre" htmlFor="title" required errors={err.title}>
            <Input
              id="title"
              name="title"
              defaultValue={val('title')}
              placeholder={`Ex. Devoir n°${nextNumber ?? 1} — sujet du devoir`}
              required
              maxLength={160}
            />
          </Field>

          {!singleSubject ? (
            <Field label="Matière" htmlFor="subjectId" required errors={err.subjectId}>
              <Select id="subjectId" name="subjectId" defaultValue={val('subjectId')} required>
                <option value="">—</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="assessmentTypeId" required errors={err.assessmentTypeId}>
              <Select id="assessmentTypeId" name="assessmentTypeId" defaultValue={val('assessmentTypeId')} required>
                <option value="">—</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Date" htmlFor="assessmentDate" required errors={err.assessmentDate}>
              <Input id="assessmentDate" name="assessmentDate" type="date" defaultValue={val('assessmentDate') || today} required />
            </Field>
          </div>

          <Field label="Noté sur" htmlFor="maxScore" required errors={err.maxScore}>
            <Select id="maxScore" name="maxScore" defaultValue={val('maxScore') || '20'} required>
              {MAX_SCORE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>

          <SubmitButton>{submitLabel}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
