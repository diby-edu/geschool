'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name: string };

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Brouillon' },
  // L'état qui sert à l'administration : ce que les enseignants déclarent fini.
  { value: 'OPEN', label: 'Prête à clôturer' },
  { value: 'CLOSED', label: 'Clôturée' },
  { value: 'PUBLISHED', label: 'Publiée' },
] as const;

/**
 * Filtres de la liste des évaluations : période, classe, matière, état.
 *
 * Un formulaire GET, donc l'URL porte le filtre — partageable, et la page reste
 * un Server Component qui ne lit qu'une page de résultats.
 */
export function AssessmentFilters({
  basePath,
  searchParams,
  periods,
  classes,
  subjects,
}: {
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  periods: Option[];
  classes: Option[];
  subjects: Option[];
}) {
  const one = (k: string): string => {
    const v = searchParams[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  const select = 'h-9 rounded-[--radius-card] border bg-[color:var(--surface)] px-2 text-sm';
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
        Période
        <select name="periode" defaultValue={one('periode')} className={select} style={{ borderColor: 'var(--border)' }}>
          <option value="">Toutes</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
        Classe
        <select name="classe" defaultValue={one('classe')} className={select} style={{ borderColor: 'var(--border)' }}>
          <option value="">Toutes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
        Matière
        <select name="matiere" defaultValue={one('matiere')} className={select} style={{ borderColor: 'var(--border)' }}>
          <option value="">Toutes</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
        État
        <select name="etat" defaultValue={one('etat')} className={select} style={{ borderColor: 'var(--border)' }}>
          <option value="">Tous</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="secondary">
        Filtrer
      </Button>
    </form>
  );
}

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
  filters: { periodId: string; classId: string; subjectId: string; status: string };
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
        <input type="hidden" name="classId" value={filters.classId} />
        <input type="hidden" name="subjectId" value={filters.subjectId} />
        <input type="hidden" name="status" value={filters.status} />
        <SubmitButton variant="secondary">Clôturer les {total} évaluations filtrées</SubmitButton>
      </form>
    </div>
  );
}
