'use client';

import { useActionState } from 'react';
import type { FormState } from '@/lib/forms';

/** Moyenne de l'ancienne école pour UNE période manquante. */
export function PreviousSchoolForm({
  action,
  period,
  current,
  school,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  period: string;
  current: number | null;
  school: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <span className="w-28 text-xs text-[color:var(--muted-foreground)]">{period}</span>
      <input
        name="average"
        inputMode="decimal"
        defaultValue={state.values?.average ?? (current === null ? '' : String(current).replace('.', ','))}
        placeholder="11,25"
        aria-label={`Moyenne de l’ancienne école — ${period}`}
        className="h-8 w-20 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-center text-sm"
      />
      <input
        name="school"
        defaultValue={state.values?.school ?? school}
        placeholder="Ancienne école (facultatif)"
        aria-label="Ancienne école"
        className="h-8 w-48 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm"
      />
      <button type="submit" disabled={pending} className="h-8 rounded-[--radius-card] border px-3 text-sm font-medium">
        Enregistrer
      </button>
      {current !== null ? (
        <button type="submit" name="remove" value="1" disabled={pending} className="h-8 px-2 text-sm text-[color:var(--color-danger)]">
          Retirer
        </button>
      ) : null}
      {state.error ? <span className="w-full text-xs text-[color:var(--color-danger)]">{state.error}</span> : null}
    </form>
  );
}
