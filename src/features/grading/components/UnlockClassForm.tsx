'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Déverrouiller une classe certifiée (ou figée) : deux temps, un motif
 * obligatoire. Le motif est inscrit au journal ; le professeur principal
 * devra certifier de nouveau.
 */
export function UnlockClassForm({
  action,
  className,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  className: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border px-3 py-1.5 text-sm"
        style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
      >
        Déverrouiller la {className}
      </button>
    );
  }
  return (
    <form action={formAction} className="w-full space-y-2 rounded-2xl border p-3" style={{ backgroundColor: 'var(--surface)' }}>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <label className="block text-sm font-medium" htmlFor="unlock-reason">
        Motif du déverrouillage (obligatoire, inscrit au journal)
      </label>
      <input
        id="unlock-reason"
        name="reason"
        required
        minLength={3}
        maxLength={300}
        placeholder="Erreur de saisie en mathématiques découverte au conseil"
        className="h-10 w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm"
      />
      <div className="flex gap-2">
        <SubmitButton size="sm">Déverrouiller</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-[color:var(--muted-foreground)]">
          Annuler
        </button>
      </div>
    </form>
  );
}
