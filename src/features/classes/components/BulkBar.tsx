'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Sélection multiple sur la page affichée.
 *
 * Le formulaire entoure le tableau : chaque ligne porte une case `ids`, et les
 * boutons agissent sur ce qui est coché. La sélection ne vaut que pour la page
 * en cours — c'est ce qu'on voit qu'on décide de traiter, jamais les classes
 * d'une autre page qu'on n'a pas sous les yeux.
 */
export function BulkForm({
  children,
  archiveAction,
  restoreAction,
  deleteAction,
  archived,
  count,
}: {
  children: React.ReactNode;
  archiveAction: Action;
  restoreAction: Action;
  deleteAction: Action;
  /** Onglet « Archivées » : on rétablit ou on supprime, on n'archive plus. */
  archived: boolean;
  /** Nombre de lignes affichées, pour le « tout sélectionner ». */
  count: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(0);
  const [state, formAction] = useActionState<FormState, FormData>(
    archived ? restoreAction : archiveAction,
    {},
  );

  // Le compteur suit les cases cochées, sans que chaque ligne ait à le savoir.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const update = () => setSelected(form.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked').length);
    form.addEventListener('change', update);
    update();
    return () => form.removeEventListener('change', update);
  }, [count, archived]);

  const toggleAll = (checked: boolean) => {
    const form = formRef.current;
    if (!form) return;
    for (const box of form.querySelectorAll<HTMLInputElement>('input[name="ids"]')) box.checked = checked;
    setSelected(checked ? count : 0);
  };

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={count > 0 && selected === count}
            onChange={(e) => toggleAll(e.target.checked)}
            aria-label="Tout sélectionner sur cette page"
          />
          Tout sélectionner
        </label>

        <span className="text-sm text-[color:var(--muted-foreground)]">
          {selected === 0 ? 'Aucune classe sélectionnée' : `${selected} classe${selected > 1 ? 's' : ''} sélectionnée${selected > 1 ? 's' : ''}`}
        </span>

        {selected > 0 ? (
          <span className="flex flex-wrap gap-2">
            <SubmitButton size="sm" variant="secondary">
              {archived ? 'Rétablir la sélection' : 'Archiver la sélection'}
            </SubmitButton>
            {archived ? <DeleteSelection action={deleteAction} selected={selected} /> : null}
          </span>
        ) : null}
      </div>

      {children}
    </form>
  );
}

/**
 * Suppression définitive : un second formulaire, qui reprend les cases cochées
 * au moment du clic. Une confirmation s'impose — rien ne se rattrape ensuite.
 */
function DeleteSelection({ action, selected }: { action: Action; selected: number }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <span>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <button
        type="submit"
        formAction={formAction}
        onClick={(e) => {
          const ok = window.confirm(
            `Supprimer définitivement ${selected} classe(s) ? Celles qui ont des inscriptions seront conservées.`,
          );
          if (!ok) e.preventDefault();
        }}
        className="h-9 cursor-pointer rounded-[--radius-card] px-3 text-sm font-semibold"
        style={{ backgroundColor: 'var(--color-danger)', color: '#fff' }}
      >
        Supprimer la sélection
      </button>
    </span>
  );
}
