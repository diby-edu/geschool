'use client';

import { useActionState } from 'react';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Une case du tableau croise : un clic accorde, un autre retire.
 *
 * Un formulaire par case plutot qu'un grand formulaire : on corrige UNE
 * anomalie reperee, on ne reenvoie pas mille quatre cents cases. L'erreur
 * eventuelle s'affiche en infobulle — une alerte par case noierait le tableau.
 */
export function CellToggle({ action, granted, label }: { action: Action; granted: boolean; label: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="inline-flex">
      <button
        type="submit"
        aria-label={label}
        title={state.error ? state.error : label}
        disabled={pending}
        className="inline-grid h-5 w-5 place-items-center rounded-md border text-[12px] font-bold transition disabled:opacity-40"
        style={
          state.error
            ? { backgroundColor: 'var(--color-danger)', borderColor: 'transparent', color: '#fff' }
            : granted
              ? { backgroundColor: 'var(--color-success)', borderColor: 'transparent', color: '#fff' }
              : { borderColor: 'var(--border)' }
        }
      >
        {state.error ? '!' : granted ? '✓' : ''}
      </button>
    </form>
  );
}
