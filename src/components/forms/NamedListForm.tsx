'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { suggestCode } from '@/lib/text/code';

export type Suggestion = {
  code: string;
  name: string;
  /** Valeurs a pre-cocher dans `checkboxes` quand on part de cette suggestion. */
  values?: string[];
};

/**
 * Ajout d'un type de salle ou d'un équipement.
 *
 * La saisie libre vient EN PREMIER : chaque école a ses ateliers, et la liste
 * proposée ne peut pas tout couvrir. Les suggestions sont en dessous, à cliquer
 * pour remplir le formulaire — ce ne sont que des noms, aucune règle n'en
 * dépend. Le code est proposé d'après le nom et reste modifiable.
 */
export function NamedListForm({
  action,
  title,
  placeholder,
  suggestions,
  existing,
  extraField,
  checkbox,
  checkboxes,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  title: string;
  placeholder: string;
  suggestions: Suggestion[];
  /** Noms déjà créés : on ne les propose plus. */
  existing: string[];
  /** Champ supplémentaire propre à la liste (ex. les points d'un motif). */
  extraField?: { name: string; label: string; type?: string; defaultValue?: string; hint?: string };
  /** Case à cocher propre à la liste (ex. « sur plusieurs jours »). */
  checkbox?: { name: string; label: string };
  /**
   * Groupe de cases à cocher propre à la liste (ex. les ordres d'enseignement
   * d'un type de salle). Cliquer une suggestion reprend ses `values`.
   */
  checkboxes?: {
    name: string;
    legend: string;
    hint?: string;
    options: { value: string; label: string }[];
    selected: string[];
  };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [picked, setPicked] = useState<string[]>(checkboxes?.selected ?? []);

  const taken = new Set(existing.map((e) => e.toLowerCase()));
  const left = suggestions.filter((s) => !taken.has(s.name.toLowerCase()));

  const fill = (s: Suggestion) => {
    setName(s.name);
    setCode(s.code);
    setCodeEdited(false);
    if (checkboxes && s.values) {
      const keep = s.values.filter((v) => checkboxes.options.some((o) => o.value === v));
      setPicked(keep.length > 0 ? keep : checkboxes.selected);
    }
  };

  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">{title}</p>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Nom" htmlFor="name" required errors={err.name}>
              <Input
                id="name"
                name="name"
                required
                placeholder={placeholder}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!codeEdited) setCode(suggestCode(e.target.value));
                }}
              />
            </Field>
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Proposé d’après le nom.">
              <Input
                id="code"
                name="code"
                required
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setCodeEdited(true);
                }}
              />
            </Field>
          </div>
          {extraField ? (
            <div className="w-32">
              <Field label={extraField.label} htmlFor={extraField.name} hint={extraField.hint} errors={err[extraField.name]}>
                <Input
                  id={extraField.name}
                  name={extraField.name}
                  type={extraField.type ?? 'text'}
                  defaultValue={extraField.defaultValue}
                  min={extraField.type === 'number' ? 0 : undefined}
                />
              </Field>
            </div>
          ) : null}
          {checkbox ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name={checkbox.name} className="size-4" />
              {checkbox.label}
            </label>
          ) : null}
          {checkboxes ? (
            <fieldset>
              <legend className="text-sm font-medium">{checkboxes.legend}</legend>
              {checkboxes.hint ? (
                <p className="mb-1 text-xs text-[color:var(--muted-foreground)]">{checkboxes.hint}</p>
              ) : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {checkboxes.options.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name={checkboxes.name}
                      value={o.value}
                      checked={picked.includes(o.value)}
                      onChange={() =>
                        setPicked((prev) =>
                          prev.includes(o.value) ? prev.filter((v) => v !== o.value) : [...prev, o.value],
                        )
                      }
                      className="size-4"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <SubmitButton size="sm">Ajouter</SubmitButton>
        </form>

        {left.length > 0 ? (
          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Ou partez d’une suggestion
            </p>
            <div className="flex flex-wrap gap-1.5">
              {left.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => fill(s)}
                  className="cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                  style={{ backgroundColor: 'var(--surface)' }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
