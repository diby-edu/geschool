'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { OPTIONAL_MODES, OPTIONAL_MODE_LABELS, type OptionalMode } from '@/features/evaluations/optional-mode';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Règles de calcul de l'établissement : ce qui compte dans une moyenne.
 *
 * Par défaut, une note compte dès sa saisie — la moyenne et le rang suivent le
 * travail des enseignants, sans attendre que l'administration clôture chaque
 * évaluation. Une école qui veut l'inverse le décoche.
 */
export function GradingPolicyForm({
  action,
  absentCountsAsZero,
  countDraftGrades,
  optionalMode,
}: {
  action: Action;
  absentCountsAsZero: boolean;
  countDraftGrades: boolean;
  optionalMode: OptionalMode;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Ce qui compte dans une moyenne</p>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Les moyennes et les rangs ne sont jamais stockés : ils sont recalculés à chaque affichage. Ces deux
            réglages décident de ce qu’ils prennent en compte.
          </p>
        </div>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <label
            className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <input
              type="checkbox"
              name="countDraftGrades"
              defaultChecked={countDraftGrades}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-semibold">Une note compte dès qu’elle est saisie</span>
              <br />
              <span className="text-xs text-[color:var(--muted-foreground)]">
                La moyenne générale et le rang bougent au fur et à mesure. Décoché, ils ne comptent que les
                évaluations clôturées par l’administration.
              </span>
            </span>
          </label>
          <label
            className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <input
              type="checkbox"
              name="absentCountsAsZero"
              defaultChecked={absentCountsAsZero}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-semibold">Une absence non justifiée compte un zéro</span>
              <br />
              <span className="text-xs text-[color:var(--muted-foreground)]">
                Décoché, l’absence est simplement ignorée : la moyenne se fait sur les autres notes. Une absence
                marquée « justifiée » à la saisie n’est jamais comptée comme un zéro, dans les deux cas.
              </span>
            </span>
          </label>
          <div>
            <p className="mb-1 text-sm font-medium">Une matière facultative</p>
            <p className="mb-2 text-xs text-[color:var(--muted-foreground)]">
              Les matières marquées « Fac. » dans « Matières par niveau » — la LV2 des séries C et D, par exemple.
            </p>
            <div className="space-y-2">
              {OPTIONAL_MODES.map((m) => (
                <label
                  key={m}
                  className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm"
                  style={{ backgroundColor: 'var(--surface)' }}
                >
                  <input
                    type="radio"
                    name="optionalMode"
                    value={m}
                    defaultChecked={optionalMode === m}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    <span className="font-semibold">{OPTIONAL_MODE_LABELS[m].title}</span>
                    <br />
                    <span className="text-xs text-[color:var(--muted-foreground)]">{OPTIONAL_MODE_LABELS[m].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <SubmitButton>Enregistrer ces règles</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
