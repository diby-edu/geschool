'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { GradeGridStudent } from '@/features/evaluations/grades';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Demander la correction d'une note, une fois l'évaluation clôturée.
 *
 * Tant qu'elle ne l'est pas, ce bloc n'a pas lieu d'être : l'enseignant
 * modifie ses notes lui-même. Après, plus personne ne les touche directement —
 * on demande, et l'enseignant répond.
 */
export function RequestCorrections({
  students,
  maxScore,
  action,
}: {
  students: GradeGridStudent[];
  maxScore: number;
  action: Action;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const notes = students.filter((s) => s.gradeId);

  if (notes.length === 0) {
    return <Alert tone="info">Aucune note saisie : il n’y a rien à corriger.</Alert>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-[color:var(--muted-foreground)]">
        L’évaluation est clôturée. Une correction ne s’applique qu’avec l’accord de l’enseignant, et le motif reste au
        journal.
      </p>
      <ul className="space-y-1">
        {notes.map((s) => (
          <li key={s.studentId} className="rounded-2xl border p-2" style={{ backgroundColor: 'var(--surface)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <strong>{s.name}</strong>
                <span className="text-[color:var(--muted-foreground)]"> · {s.matricule}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-sm font-semibold">
                  {s.isAbsent ? 'Absent' : s.score === null ? '—' : String(s.score).replace('.', ',')}
                </span>
                <button
                  type="button"
                  onClick={() => setOuvert(ouvert === s.studentId ? null : s.studentId)}
                  className="rounded-xl border px-2 py-1 text-xs"
                >
                  {ouvert === s.studentId ? 'Annuler' : 'Demander une correction'}
                </button>
              </span>
            </div>
            {ouvert === s.studentId && s.gradeId ? (
              <Formulaire action={action} gradeId={s.gradeId} maxScore={maxScore} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Formulaire({ action, gradeId, maxScore }: { action: Action; gradeId: string; maxScore: number }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [absent, setAbsent] = useState(false);

  return (
    <form action={formAction} className="mt-2 space-y-2 border-t pt-2">
      <input type="hidden" name="gradeId" value={gradeId} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium">
          Note corrigée (sur {maxScore})
          <input
            type="text"
            inputMode="decimal"
            name="newScore"
            disabled={absent}
            className="ml-2 w-20 rounded-xl border px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            name="newIsAbsent"
            checked={absent}
            onChange={(e) => setAbsent(e.target.checked)}
            className="size-4"
          />
          L’élève était absent
        </label>
      </div>
      <label className="block text-xs font-medium">
        Motif — il figurera au journal et sera lu par l’enseignant
        <textarea name="reason" rows={2} className="mt-1 w-full rounded-xl border px-2 py-1.5 text-sm" />
      </label>
      <SubmitButton>Envoyer la demande</SubmitButton>
    </form>
  );
}
