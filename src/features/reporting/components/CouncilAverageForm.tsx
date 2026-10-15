'use client';

import { useActionState } from 'react';
import type { FormState } from '@/lib/forms';

/**
 * Une ligne du conseil : moyenne retenue et motif. « Retirer » revient à la
 * moyenne calculée. Le motif ne s'imprime nulle part : il va au journal.
 */
export function CouncilAverageForm({
  action,
  current,
  reason,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  current: number | null;
  reason: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        name="average"
        inputMode="decimal"
        defaultValue={state.values?.average ?? (current === null ? '' : String(current).replace('.', ','))}
        placeholder="10"
        aria-label="Moyenne retenue"
        className="h-8 w-20 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-center text-sm"
      />
      <select
        name="reason"
        defaultValue={state.values?.reason ?? (reason || 'Repêchage')}
        aria-label="Motif"
        className="h-8 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm"
      >
        <option>Repêchage</option>
        <option>Dérogation</option>
        <option>Décision du conseil</option>
      </select>
      <button type="submit" disabled={pending} className="h-8 rounded-[--radius-card] border px-3 text-sm font-medium">
        {current === null ? 'Retenir' : 'Modifier'}
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
