'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Values = Partial<{
  code: string;
  name: string;
  shortName: string;
  category: string;
  color: string;
  defaultCoefficient: string;
  isActive: string;
}>;

const TRACK_CHOICES = [
  { code: 'GENERAL', label: 'Général' },
  { code: 'TECHNIQUE', label: 'Technique' },
  { code: 'PROFESSIONNEL', label: 'Professionnel' },
] as const;

export function SubjectForm({
  action,
  defaultValues = {},
  submitLabel,
  defaultActive = true,
  schoolTracks,
  defaultTracks,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: Values;
  submitLabel: string;
  defaultActive?: boolean;
  /** Ordres d'enseignement de l'établissement : on ne propose que ceux-là. */
  schoolTracks: string[];
  /** Ordres de la matière ; par défaut, tous ceux de l'établissement. */
  defaultTracks?: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = { ...defaultValues, ...(state.values ?? {}) };
  const err = state.fieldErrors ?? {};
  const isActive = state.values ? state.values.isActive != null : defaultActive;

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Ex. MATH">
              <Input id="code" name="code" defaultValue={v.code} required autoFocus />
            </Field>
            <Field label="Coefficient par defaut" htmlFor="defaultCoefficient" required errors={err.defaultCoefficient}>
              <Input
                id="defaultCoefficient"
                name="defaultCoefficient"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v.defaultCoefficient ?? '1'}
                required
              />
            </Field>
          </div>

          <Field label="Nom" htmlFor="name" required errors={err.name}>
            <Input id="name" name="name" defaultValue={v.name} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Abreviation" htmlFor="shortName" errors={err.shortName}>
              <Input id="shortName" name="shortName" defaultValue={v.shortName} placeholder="Ex. Maths" />
            </Field>
            <Field label="Catégorie" htmlFor="category" errors={err.category}>
              <Input id="category" name="category" defaultValue={v.category} placeholder="Ex. Scientifique" />
            </Field>
          </div>

          {schoolTracks.length > 1 ? (
            <fieldset>
              <legend className="mb-1 text-sm font-medium">
                Ordres d’enseignement <span className="text-[color:var(--color-danger)]">*</span>
              </legend>
              <p className="mb-2 text-xs text-[color:var(--muted-foreground)]">
                Où cette matière est-elle enseignée ? Une matière commune (mathématiques, français…) se coche partout.
              </p>
              <div className="flex flex-wrap gap-3">
                {TRACK_CHOICES.filter((t) => schoolTracks.includes(t.code)).map((t) => (
                  <label key={t.code} className="flex items-center gap-2 rounded-[--radius-card] border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      name="tracks"
                      value={t.code}
                      defaultChecked={(defaultTracks ?? schoolTracks).includes(t.code)}
                      className="size-4"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              {err.tracks ? <p className="mt-1 text-xs text-[color:var(--color-danger)]">{err.tracks.join(' ')}</p> : null}
            </fieldset>
          ) : (
            <input type="hidden" name="tracks" value={schoolTracks[0] ?? 'GENERAL'} />
          )}

          <Field label="Couleur" htmlFor="color" errors={err.color} hint="Format #RRGGBB, optionnel">
            <Input id="color" name="color" defaultValue={v.color} placeholder="#2563eb" />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={isActive} className="size-4" />
            Matière active
          </label>

          <div className="flex gap-2 pt-2">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
