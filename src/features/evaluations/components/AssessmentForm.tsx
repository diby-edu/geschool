'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { ClassRef, PeriodRef, Ref } from '@/features/evaluations/refs';
import { periodsForTrack } from '@/features/academic-years/periods-by-track';
import { coefficientFromMaxScore } from '@/features/evaluations/schemas';

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
};

export function AssessmentForm({
  action,
  refs,
  defaults = {},
  submitLabel = 'Créer l’évaluation',
  /**
   * Verrouille le champ Discipline sur l'unique matière fournie (tableau de
   * bord enseignant : un professeur qui n'enseigne qu'une matière dans cette
   * classe n'a pas à la choisir — RBAC.md, affectation réelle via
   * teaching_assignments). Ignoré si `refs.subjects` contient plusieurs
   * options : le champ reste alors un choix explicite.
   */
  lockSubjectIfSingle = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  refs: {
    subjects: Ref[];
    classes: ClassRef[];
    /** Groupes notables, avec la classe qui donne leur decoupage de periodes. */
    groups: (Ref & { classId: string | null })[];
    periods: PeriodRef[];
    types: Ref[];
    scales: Ref[];
    teachers: Ref[];
  };
  defaults?: Defaults;
  submitLabel?: string;
  lockSubjectIfSingle?: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = { ...defaults, ...(state.values ?? {}) } as Record<string, string | number | undefined>;
  const val = (k: string) => (v[k] === undefined || v[k] === null ? '' : String(v[k]));
  const today = new Date().toISOString().slice(0, 10);
  const [maxScore, setMaxScore] = useState<string>(val('maxScore') || '20');
  const coefficient = coefficientFromMaxScore(Number(maxScore) || 0);
  const singleSubject = lockSubjectIfSingle && refs.subjects.length === 1 ? refs.subjects[0] : null;
  // Une seule classe proposee = deja choisie avant d'arriver ici (dossier de
  // classe du tableau de bord enseignant) : la reproposer en menu serait une
  // question sans reponse possible. L'admin, lui, voit toujours la liste
  // complete de l'etablissement (jamais un seul choix).
  const singleClass = refs.classes.length === 1 ? refs.classes[0] : null;
  // La classe commande le decoupage : trimestres pour le general, semestres pour
  // le technique et le professionnel. Un bulletin ne melange jamais deux ordres,
  // donc une evaluation non plus. Un professeur qui enseigne dans plusieurs
  // ordres voit la bonne liste des qu'il choisit la classe.
  const [target, setTarget] = useState<string>(
    singleClass ? `CLASS:${singleClass.id}` : val('target'),
  );
  // Le decoupage des periodes suit l'ordre d'enseignement de la classe visee ;
  // pour un groupe, celui de la premiere classe dont il tire ses eleves.
  const targetClassId = target.startsWith('CLASS:')
    ? target.slice(6)
    : (refs.groups.find((g) => `GROUP:${g.id}` === target)?.classId ?? '');
  const chosenClass = refs.classes.find((c) => c.id === targetClassId) ?? singleClass;
  const periods = chosenClass ? periodsForTrack(refs.periods, chosenClass.track) : refs.periods;
  // Meme logique pour la periode : deja choisie via l'onglet du dossier de
  // classe avant d'ouvrir ce formulaire.
  const singlePeriod = periods.length === 1 ? periods[0] : null;

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
              {singleSubject ? (
                <>
                  <Input id="subjectId-display" value={singleSubject.name} disabled />
                  <input type="hidden" name="subjectId" value={singleSubject.id} />
                </>
              ) : (
                <Select id="subjectId" name="subjectId" defaultValue={val('subjectId')} required>
                  <option value="">—</option>
                  {refs.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}
            </Field>
            <Field
              label={refs.groups.length > 0 ? 'Classe ou groupe' : 'Classe'}
              htmlFor="target"
              required
              errors={err.target}
              {...(refs.groups.length > 0
                ? { hint: 'Un groupe ne fait apparaitre que ses élèves dans la grille de saisie.' }
                : {})}
            >
              {singleClass ? (
                <>
                  <Input id="target-display" value={singleClass.name} disabled />
                  <input type="hidden" name="target" value={`CLASS:${singleClass.id}`} />
                </>
              ) : (
                <Select id="target" name="target" value={target} onChange={(e) => setTarget(e.target.value)} required>
                  <option value="">—</option>
                  <optgroup label="Classes">
                    {refs.classes.map((c) => (
                      <option key={c.id} value={`CLASS:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                  {refs.groups.length > 0 ? (
                    <optgroup label="Groupes">
                      {refs.groups.map((g) => (
                        <option key={g.id} value={`GROUP:${g.id}`}>
                          {g.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </Select>
              )}
            </Field>
            <Field label="Période" htmlFor="periodId" required errors={err.periodId}>
              {singlePeriod ? (
                <>
                  <Input id="periodId-display" value={singlePeriod.name} disabled />
                  <input type="hidden" name="periodId" value={singlePeriod.id} />
                </>
              ) : (
                <Select id="periodId" name="periodId" defaultValue={val('periodId')} key={chosenClass?.track ?? 'all'} required>
                  <option value="">—</option>
                  {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
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
            <Field label="Noté sur" htmlFor="maxScore" required errors={err.maxScore}>
              <Input
                id="maxScore"
                name="maxScore"
                type="number"
                min="0.5"
                step="0.5"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                required
              />
            </Field>
            <Field label="Coefficient (automatique)" htmlFor="coefficient-display">
              <Input id="coefficient-display" value={coefficient} disabled title="Coefficient = barème / 20, calculé automatiquement." />
            </Field>
          </div>

          <SubmitButton>{submitLabel}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
