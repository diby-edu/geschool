'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Le tableau des évaluations, dans un formulaire de sélection.
 *
 * Clôturer fait entrer les notes dans les moyennes ; c'est un geste de
 * l'administration, et sur une école réelle il porte sur des milliers
 * d'évaluations. D'où les deux portées : ce qui est coché, ou tout ce que le
 * filtre affiché désigne.
 */
export function BulkSelectionForm({
  closeAction,
  publishAction,
  closeFilterAction,
  total,
  back,
  filters,
  children,
}: {
  closeAction: Action;
  publishAction: Action | null;
  closeFilterAction: Action;
  total: number;
  back: string;
  filters: { periodId: string; levelId: string; classId: string; subjectId: string; status: string };
  children: React.ReactNode;
}) {
  const [closeState, closeForm] = useActionState<FormState, FormData>(closeAction, {});
  const [publishState, publishForm] = useActionState<FormState, FormData>(publishAction ?? closeAction, {});
  const [filterState, filterForm] = useActionState<FormState, FormData>(closeFilterAction, {});
  const error = closeState.error ?? publishState.error ?? filterState.error;

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <form action={closeForm} className="space-y-3">
        <input type="hidden" name="back" value={back} />
        {children}
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton>Clôturer la sélection</SubmitButton>
          {publishAction ? (
            <button
              type="submit"
              formAction={publishForm}
              className="h-9 rounded-[--radius-card] border px-3 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              Publier la sélection
            </button>
          ) : null}
          <span className="text-xs text-[color:var(--muted-foreground)]">
            Clôturer fait entrer les notes dans les moyennes et les bulletins.
          </span>
        </div>
      </form>

      <form
        action={filterForm}
        onSubmit={(e) => {
          if (!window.confirm(`Clôturer les ${total} évaluation(s) que ce filtre désigne ?`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="periodId" value={filters.periodId} />
        <input type="hidden" name="levelId" value={filters.levelId} />
        <input type="hidden" name="classId" value={filters.classId} />
        <input type="hidden" name="subjectId" value={filters.subjectId} />
        <input type="hidden" name="status" value={filters.status} />
        <SubmitButton variant="secondary">Clôturer les {total} évaluations filtrées</SubmitButton>
      </form>
    </div>
  );
}
