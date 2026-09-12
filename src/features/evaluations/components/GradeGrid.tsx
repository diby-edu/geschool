'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { GradeGridStudent } from '@/features/evaluations/grades';

/**
 * Grille de saisie des notes. Une ligne par élève inscrit. Le score est borné
 * par le barème de l'évaluation ; « Absent » désactive le score. Après clôture,
 * la grille est en lecture seule (sauf droit de correction).
 */
export function GradeGrid({
  action,
  maxScore,
  editable,
  students,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  maxScore: number;
  editable: boolean;
  students: GradeGridStudent[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  if (students.length === 0) {
    return <Alert tone="info">Aucun élève inscrit dans cette classe.</Alert>;
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="studentIds" value={students.map((s) => s.studentId).join(',')} />

      <div className="overflow-x-auto rounded-[--radius-card] border">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Matricule</th>
              <th className="px-3 py-2">Élève</th>
              <th className="px-3 py-2 w-28">Note / {maxScore}</th>
              <th className="px-3 py-2 w-20 text-center">Absent</th>
              <th className="px-3 py-2">Observation</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.studentId} className="border-t">
                <td className="px-3 py-1.5 font-mono text-xs text-[color:var(--muted-foreground)]">{s.matricule}</td>
                <td className="px-3 py-1.5">{s.name}</td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    name={`score_${s.studentId}`}
                    defaultValue={s.score ?? ''}
                    min="0"
                    max={maxScore}
                    step="0.01"
                    disabled={!editable}
                    className="h-9 w-24 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input type="checkbox" name={`absent_${s.studentId}`} defaultChecked={s.isAbsent} disabled={!editable} className="size-4" />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    name={`comment_${s.studentId}`}
                    defaultValue={s.comment}
                    disabled={!editable}
                    maxLength={200}
                    className="h-9 w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm disabled:opacity-60"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable ? (
        <SubmitButton>Enregistrer les notes</SubmitButton>
      ) : (
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Évaluation clôturée : la saisie est verrouillée.
        </p>
      )}
    </form>
  );
}
