'use client';

import { useActionState, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { StudentAvatar } from '@/components/ui/student-avatar';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { GradeGridStudent } from '@/features/evaluations/grades';

/**
 * Grille de saisie des notes. Une ligne par élève inscrit (ordre alphabétique).
 * Le score est borné par le barème de l'évaluation ; « Absent » est replié
 * derrière une action par ligne (cas rare, pas une colonne toujours visible).
 * Après clôture, la grille est en lecture seule (sauf droit de correction).
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set(students.filter((s) => s.isAbsent).map((s) => s.studentId)));
  const scoreRefs = useRef<(HTMLInputElement | null)[]>([]);

  if (students.length === 0) {
    return <Alert tone="info">Aucun élève inscrit dans cette classe.</Alert>;
  }

  function toggleExpanded(studentId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function focusNext(index: number) {
    const next = scoreRefs.current[index + 1];
    if (next) {
      next.focus();
      next.select();
    }
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="studentIds" value={students.map((s) => s.studentId).join(',')} />

      <ul className="divide-y overflow-hidden rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
        {students.map((s, i) => {
          const isExpanded = expanded.has(s.studentId);
          return (
            <li key={s.studentId} className="px-3 py-2">
              <div className="flex items-center gap-3">
                <StudentAvatar name={s.name} photoUrl={s.photoUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="block truncate font-mono text-xs text-[color:var(--muted-foreground)]">{s.matricule}</span>
                </span>
                <input
                  ref={(el) => { scoreRefs.current[i] = el; }}
                  type="number"
                  name={`score_${s.studentId}`}
                  defaultValue={s.score ?? ''}
                  min="0"
                  max={maxScore}
                  step="0.01"
                  disabled={!editable}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusNext(i);
                    }
                  }}
                  className="h-9 w-20 shrink-0 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-center text-sm disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => toggleExpanded(s.studentId)}
                  disabled={!editable}
                  title="Marquer absent"
                  className="grid size-7 shrink-0 place-items-center rounded-full border text-sm text-[color:var(--muted-foreground)] disabled:opacity-40"
                  style={{ borderColor: 'var(--border)' }}
                >
                  ⋯
                </button>
              </div>
              {isExpanded ? (
                <label className="mt-2 ml-12 flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
                  <input type="checkbox" name={`absent_${s.studentId}`} defaultChecked={s.isAbsent} disabled={!editable} className="size-4" />
                  Absent à cette évaluation
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>

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
