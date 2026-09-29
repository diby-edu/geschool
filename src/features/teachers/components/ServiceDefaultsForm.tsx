'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { EMPLOYMENT_LABELS, EMPLOYMENT_TYPES, type ServiceDefaults } from '../service-types';

/**
 * Service hebdomadaire par défaut, par type de contrat.
 *
 * Ce que l'école dit ici s'applique à tout enseignant dont la fiche ne porte
 * aucune borne. Une fiche renseignée l'emporte toujours : ce sont des valeurs
 * de départ, pas des règles imposées.
 */
export function ServiceDefaultsForm({
  action,
  defaults,
  sessionMinutes,
  canEdit,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: ServiceDefaults;
  /** Durée d'une séance : sert à rappeler à quoi correspond un nombre. */
  sessionMinutes: number;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Service hebdomadaire par type de contrat</p>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              En séances par semaine. Une séance dure {sessionMinutes} min dans votre établissement. Laissez vide si
              vous ne fixez pas de borne — et sachez qu’une valeur saisie sur la fiche d’un enseignant l’emporte
              toujours sur celle-ci.
            </p>
          </div>

          <ul>
            {EMPLOYMENT_TYPES.map((type) => (
              <li key={type} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b px-4 py-2.5 last:border-0">
                <span className="min-w-32 flex-1 text-sm font-medium">{EMPLOYMENT_LABELS[type]}</span>

                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  Minimum
                  <Input
                    name={`min:${type}`}
                    type="number"
                    min="0"
                    max="60"
                    defaultValue={defaults[type]?.min ?? ''}
                    disabled={!canEdit}
                    placeholder="—"
                    aria-label={`Service minimum d’un ${EMPLOYMENT_LABELS[type].toLowerCase()}`}
                    className="h-8 w-20 text-center tabular-nums"
                  />
                </label>

                <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  Maximum
                  <Input
                    name={`max:${type}`}
                    type="number"
                    min="0"
                    max="60"
                    defaultValue={defaults[type]?.max ?? ''}
                    disabled={!canEdit}
                    placeholder="—"
                    aria-label={`Service maximum d’un ${EMPLOYMENT_LABELS[type].toLowerCase()}`}
                    className="h-8 w-20 text-center tabular-nums"
                  />
                </label>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canEdit ? <SubmitButton>Enregistrer les valeurs par défaut</SubmitButton> : null}
    </form>
  );
}
