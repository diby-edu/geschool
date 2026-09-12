'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

/**
 * Lancement d'une generation. Le resultat infaisable revient dans l'etat du
 * formulaire (liste de diagnostics deja traduits) et s'affiche ici ; un succes
 * redirige vers la version brouillon produite.
 */
export function GenerateForm({
  action,
  requirementCount,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  requirementCount: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  let diagnostics: string[] = [];
  if (state.values?.diagnostics) {
    try {
      const parsed: unknown = JSON.parse(state.values.diagnostics);
      if (Array.isArray(parsed)) diagnostics = parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      diagnostics = [];
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Generation automatique</h2>
          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
            Le moteur place les {requirementCount} exigence(s) active(s) en respectant les conflits
            enseignant / classe / groupe / salle et les disponibilites. Une nouvelle version brouillon
            est produite ; la version publiee n&apos;est jamais modifiee.
          </p>
        </div>

        {state.error ? <Alert tone="error">{state.error}</Alert> : null}

        {diagnostics.length > 0 ? (
          <div className="rounded-[--radius-card] border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger)]/5 p-3">
            <p className="mb-2 text-sm font-medium">Pourquoi c&apos;est impossible :</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--foreground)]">
              {diagnostics.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
              Ajustez les exigences (nombre de seances, salles), la grille horaire ou les
              disponibilites, puis relancez.
            </p>
          </div>
        ) : null}

        <form action={formAction}>
          <SubmitButton disabled={requirementCount === 0}>Lancer la generation</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
