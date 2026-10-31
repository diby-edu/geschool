'use client';

import Form from 'next/form';
import { useRef, useState } from 'react';

export type FilterOption = { value: string; label: string; /** Valeur du filtre parent dont dépend cette option (classe → niveau). */ parent?: string };

export type FilterField = {
  name: string;
  label: string;
  /** Libellé de « aucun filtre » : « Tous les niveaux ». */
  allLabel: string;
  value: string;
  options: FilterOption[];
  /** Nom du filtre parent : ses options se restreignent à celles de la valeur choisie. */
  dependsOn?: string;
  /** Un jour (calendrier) au lieu d'une liste. */
  type?: 'select' | 'date';
};

/**
 * Barre de filtres commune à toutes les listes (maquette listes-et-presences,
 * validée le 2026-10-30) : mêmes listes déroulantes au même endroit, et une
 * recherche. Le filtre vit dans l'adresse (formulaire GET, navigation sans
 * recharger la page) : un lien filtré se partage, le retour arrière fonctionne.
 * Changer un filtre l'applique aussitôt et revient à la page 1.
 */
export function ListFilters({
  basePath,
  fields,
  search,
  keep = {},
  children,
}: {
  basePath: string;
  fields: FilterField[];
  search?: { value: string; placeholder: string };
  /** Paramètres à garder tels quels (tri…). */
  keep?: Record<string, string>;
  children?: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.value])));

  const change = (name: string, value: string) => {
    const next = { ...values, [name]: value };
    // Un filtre qui dépend de celui-ci repart de « tous » si son choix n'existe plus.
    for (const f of fields) {
      if (f.dependsOn === name && next[f.name] && !f.options.some((o) => o.value === next[f.name] && (!value || o.parent === value))) next[f.name] = '';
    }
    setValues(next);
    // La valeur passe d'abord dans le formulaire, puis il part.
    requestAnimationFrame(() => form.current?.requestSubmit());
  };

  return (
    <Form
      ref={form}
      action={basePath}
      scroll={false}
      className="flex flex-wrap items-end gap-2 rounded-2xl border px-3 py-2.5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
    >
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {fields.map((f) => {
        if (f.type === 'date') {
          return (
            <label key={f.name} className="flex flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
              {f.label}
              <input
                type="date"
                name={f.name}
                value={values[f.name] ?? ''}
                onChange={(e) => e.target.value && change(f.name, e.target.value)}
                className="h-9 rounded-xl border bg-[color:var(--surface)] px-2.5 text-sm text-[color:var(--foreground)]"
                style={{ borderColor: 'var(--border)' }}
              />
            </label>
          );
        }
        const parent = f.dependsOn ? values[f.dependsOn] : '';
        const options = parent ? f.options.filter((o) => o.parent === parent) : f.options;
        return (
          <label key={f.name} className="flex min-w-[9rem] flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
            {f.label}
            <select
              name={values[f.name] ? f.name : undefined}
              value={values[f.name] ?? ''}
              onChange={(e) => change(f.name, e.target.value)}
              className="h-9 rounded-xl border bg-[color:var(--surface)] px-2.5 text-sm text-[color:var(--foreground)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <option value="">{f.allLabel}</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {search ? (
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-[color:var(--muted-foreground)]">
          Recherche
          <span className="flex gap-1.5">
            <input
              type="search"
              name="q"
              defaultValue={search.value}
              placeholder={search.placeholder}
              className="h-9 min-w-0 flex-1 rounded-xl border bg-[color:var(--surface)] px-2.5 text-sm text-[color:var(--foreground)]"
              style={{ borderColor: 'var(--border)' }}
            />
            <button type="submit" className="h-9 shrink-0 rounded-xl border px-3 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
              Chercher
            </button>
          </span>
        </label>
      ) : null}
      {children}
    </Form>
  );
}
