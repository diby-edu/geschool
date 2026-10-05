'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { SuggestedYear } from '@/features/academic-years/school-year';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Choisir son annee scolaire plutot que la saisir.
 *
 * Trois annees sont sous la main — l'an dernier, cette annee, l'an prochain —
 * avec leurs dates deja remplies. Le nom ne se demande pas : « 2026-2027 » se
 * deduit de la rentree.
 *
 * Le pli « Autre periode » reste pour les calendriers qui ne commencent pas en
 * septembre : rien de pedagogique n'est fige.
 */
export function YearPicker({
  action,
  suggestions,
  existing,
}: {
  action: Action;
  suggestions: SuggestedYear[];
  /** Noms des annees deja creees : on ne propose pas deux fois la meme. */
  existing: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [choix, setChoix] = useState<string | null>(suggestions.find((s) => s.current && !existing.includes(s.name))?.name ?? null);
  const [libre, setLibre] = useState(false);

  const dejaLa = new Set(existing);
  const retenue = suggestions.find((s) => s.name === choix) ?? null;
  const err = state.fieldErrors ?? {};

  return (
    <div className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <ul className="grid gap-3 sm:grid-cols-3">
        {suggestions.map((s) => {
          const prise = dejaLa.has(s.name);
          const active = s.name === choix;
          return (
            <li key={s.name}>
              <button
                type="button"
                disabled={prise}
                onClick={() => {
                  setChoix(s.name);
                  setLibre(false);
                }}
                className="w-full rounded-[--radius-card] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-55"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: active ? 'var(--color-brand)' : 'var(--border)',
                  boxShadow: active ? '0 0 0 1px var(--color-brand)' : undefined,
                }}
                aria-pressed={active}
              >
                <span className="block text-xs font-medium text-[color:var(--muted-foreground)]">{s.hint}</span>
                <span className="mt-0.5 block text-lg font-bold tracking-tight">{s.name}</span>
                <span className="mt-1 block text-xs text-[color:var(--muted-foreground)]">
                  {prise ? 'Déjà créée' : `Du 1er septembre au 31 juillet`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Card>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {libre || !retenue ? (
              <>
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  Les dates de votre calendrier. Le nom de l’année en découle&nbsp;: une rentrée en septembre 2026
                  donne « 2026-2027 ».
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Début" htmlFor="startsOn" required errors={err.startsOn}>
                    <Input id="startsOn" name="startsOn" type="date" defaultValue={retenue?.startsOn} required />
                  </Field>
                  <Field label="Fin" htmlFor="endsOn" required errors={err.endsOn}>
                    <Input id="endsOn" name="endsOn" type="date" defaultValue={retenue?.endsOn} required />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <input type="hidden" name="startsOn" value={retenue.startsOn} />
                <input type="hidden" name="endsOn" value={retenue.endsOn} />
                <p className="text-sm">
                  Année <strong>{retenue.name}</strong>, du 1<sup>er</sup> septembre {retenue.startYear} au 31 juillet{' '}
                  {retenue.startYear + 1}.{' '}
                  <button type="button" onClick={() => setLibre(true)} className="underline">
                    Changer les dates
                  </button>
                </p>
              </>
            )}

            <SubmitButton>{retenue && !libre ? `Créer ${retenue.name}` : 'Créer l’année'}</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
