'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { Ref } from '@/features/evaluations/refs';

const MAX_SCORE_OPTIONS = [10, 20, 40, 50, 100];

/** Les `count` premiers numéros pas encore pris (jamais un numéro déjà utilisé pour ce type). */
function nextAvailableNumbers(used: number[], count = 6): number[] {
  const usedSet = new Set(used);
  const out: number[] = [];
  for (let n = 1; out.length < count; n++) {
    if (!usedSet.has(n)) out.push(n);
  }
  return out;
}

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
  usedNumbersByType,
  classId,
  periodId,
  gradingScaleId,
  teacherId,
  submitLabel = 'Créer l’évaluation',
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  subjects: Ref[];
  types: Ref[];
  /** Numéros déjà pris par type d'évaluation (assessment_type_id -> numéros utilisés). */
  usedNumbersByType: Record<string, number[]>;
  classId: string;
  periodId: string;
  gradingScaleId: string;
  teacherId?: string;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = (state.values ?? {}) as Record<string, string | undefined>;
  const val = (k: string) => v[k] ?? '';
  const today = new Date().toISOString().slice(0, 10);
  const singleSubject = subjects.length === 1 ? subjects[0] : null;

  const [typeId, setTypeId] = useState(val('assessmentTypeId') || types[0]?.id || '');
  const availableNumbers = nextAvailableNumbers(usedNumbersByType[typeId] ?? []);
  const [number, setNumber] = useState(availableNumbers[0] ?? 1);

  function changeType(id: string) {
    setTypeId(id);
    setNumber(nextAvailableNumbers(usedNumbersByType[id] ?? [])[0] ?? 1);
  }

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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="assessmentTypeId" required errors={err.assessmentTypeId}>
              <Select
                id="assessmentTypeId"
                name="assessmentTypeId"
                value={typeId}
                onChange={(e) => changeType(e.target.value)}
                required
              >
                <option value="">—</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Évaluation n°" htmlFor="sequenceNumber">
              <Select
                id="sequenceNumber"
                name="sequenceNumber"
                value={number}
                onChange={(e) => setNumber(Number(e.target.value))}
              >
                {availableNumbers.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Titre" htmlFor="title" required errors={err.title}>
            <Input
              id="title"
              name="title"
              defaultValue={val('title')}
              placeholder={`Ex. Devoir n°${number} — sujet du devoir`}
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
            <Field label="Date" htmlFor="assessmentDate" required errors={err.assessmentDate}>
              <Input id="assessmentDate" name="assessmentDate" type="date" defaultValue={val('assessmentDate') || today} required />
            </Field>
            <Field label="Noté sur" htmlFor="maxScore" required errors={err.maxScore}>
              <Select id="maxScore" name="maxScore" defaultValue={val('maxScore') || '20'} required>
                {MAX_SCORE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
          </div>

          <SubmitButton>{submitLabel}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
