'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { ReenrollCandidate } from '@/features/students/reenrollment-types';

type Opt = { id: string; name: string };

/**
 * Faire monter une classe à l'année suivante.
 *
 * Le geste réel du secrétariat est « tout le monde monte, sauf ceux-là qui
 * redoublent » : la liste arrive donc entièrement cochée, et on décoche.
 * Un élève déjà inscrit dans l'année d'arrivée, ou parti en cours d'année,
 * arrive décoché et le dit.
 */
export function ReenrollForm({
  action,
  candidates,
  classes,
  targetYearId,
  fromClassId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  candidates: ReenrollCandidate[];
  classes: Opt[];
  targetYearId: string;
  fromClassId: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [taken, setTaken] = useState<Set<string>>(
    new Set(candidates.filter((c) => !c.alreadyEnrolled && c.leftStatus === 'ENROLLED').map((c) => c.studentId)),
  );
  const [repeating, setRepeating] = useState<Set<string>>(
    new Set(candidates.filter((c) => c.wasRepeating).map((c) => c.studentId)),
  );

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="targetYearId" value={targetYearId} />
      <input type="hidden" name="fromClassId" value={fromClassId} />

      <label className="block text-sm font-medium">
        Classe d’arrivée
        <select
          name="toClassId"
          required
          defaultValue=""
          className="mt-1 h-10 w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <option value="" disabled>
            —
          </option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <p className="text-sm text-[color:var(--muted-foreground)]">
        {taken.size} élève{taken.size > 1 ? 's' : ''} à réinscrire sur {candidates.length}
        {repeating.size > 0 ? ` · ${repeating.size} redoublant(s)` : ''}
      </p>

      <ul className="divide-y overflow-hidden rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
        {candidates.map((c) => {
          const blocked = c.alreadyEnrolled;
          return (
            <li key={c.studentId} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                name="studentIds"
                value={c.studentId}
                checked={taken.has(c.studentId)}
                onChange={() => toggle(taken, setTaken, c.studentId)}
                disabled={blocked}
                className="size-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block truncate font-mono text-xs text-[color:var(--muted-foreground)]">
                  {c.matricule}
                  {blocked ? ' · déjà inscrit l’année suivante' : ''}
                  {!blocked && c.leftStatus !== 'ENROLLED' ? ' · a quitté l’établissement' : ''}
                </span>
              </span>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-[color:var(--muted-foreground)]">
                <input
                  type="checkbox"
                  name="repeatingIds"
                  value={c.studentId}
                  checked={repeating.has(c.studentId)}
                  onChange={() => toggle(repeating, setRepeating, c.studentId)}
                  disabled={blocked || !taken.has(c.studentId)}
                  className="size-4"
                />
                redouble
              </label>
            </li>
          );
        })}
      </ul>

      <SubmitButton>Réinscrire les élèves cochés</SubmitButton>
    </form>
  );
}
