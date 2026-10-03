'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * L'étape entre « construit » et « diffusé ».
 *
 * Un emploi du temps publié arrive d'un coup chez tout l'établissement : une
 * erreur se découvre alors en salle des professeurs. Quelqu'un le relit
 * d'abord, et signe sa relecture.
 */
export function ValidationPanel({
  validate,
  reopen,
  status,
  validatedAt,
  note,
  canValidate,
}: {
  validate: Action;
  reopen: Action;
  status: string;
  validatedAt: string | null;
  note: string | null;
  canValidate: boolean;
}) {
  const [etatValide, actionValide] = useActionState<FormState, FormData>(validate, {});
  const [etatRouvre, actionRouvre] = useActionState<FormState, FormData>(reopen, {});
  const [ouvert, setOuvert] = useState(false);
  const erreur = etatValide.error ?? etatRouvre.error;

  if (status === 'PUBLISHED' || status === 'ARCHIVED') return null;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Vérification</p>
          <span className="text-sm">
            {status === 'VALIDATED' ? (
              <span style={{ color: 'var(--color-success)' }}>
                Vérifié{validatedAt ? ` le ${new Date(validatedAt).toLocaleDateString('fr-FR')}` : ''}
              </span>
            ) : (
              <span className="text-[color:var(--muted-foreground)]">Pas encore vérifié</span>
            )}
          </span>
        </div>

        {erreur ? <Alert tone="error">{erreur}</Alert> : null}
        {note ? (
          <p className="rounded-xl border p-2 text-sm" style={{ backgroundColor: 'var(--surface)' }}>
            <span className="text-[color:var(--muted-foreground)]">Réserves : </span>
            {note}
          </p>
        ) : null}

        {!canValidate ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Vous n’avez pas le droit de vérifier une version.
          </p>
        ) : status === 'VALIDATED' ? (
          <form action={actionRouvre}>
            <p className="mb-2 text-sm text-[color:var(--muted-foreground)]">
              Cette version peut être publiée. La rouvrir la rendra modifiable et effacera la vérification.
            </p>
            <SubmitButton>Rouvrir pour modification</SubmitButton>
          </form>
        ) : !ouvert ? (
          <>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Relisez l’emploi du temps, puis signez votre relecture. La publication reste un geste séparé.
            </p>
            <button
              type="button"
              onClick={() => setOuvert(true)}
              className="rounded-xl border px-3 py-1.5 text-sm"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              Marquer comme vérifié
            </button>
          </>
        ) : (
          <form action={actionValide} className="space-y-2">
            <label className="block text-xs font-medium" htmlFor="note">
              Réserves ou points à surveiller (facultatif)
            </label>
            <textarea id="note" name="note" rows={2} className="w-full rounded-xl border px-2 py-1.5 text-sm" />
            <div className="flex gap-2">
              <SubmitButton>Confirmer la vérification</SubmitButton>
              <button type="button" onClick={() => setOuvert(false)} className="rounded-xl border px-3 py-1.5 text-sm">
                Annuler
              </button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
