'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { Input } from '@/components/ui/input';
import type { FormState } from '@/lib/forms';
import type { SchoolFeatureRow } from '../features';

/**
 * Un module, activé ou coupé pour cet établissement. Couper demande un motif :
 * six mois plus tard, personne ne se souvient pourquoi une école n'a pas les
 * bulletins, et la question revient au support.
 */
export function FeatureToggle({
  row,
  action,
}: {
  row: SchoolFeatureRow;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <Card>
      <CardContent className="space-y-2 py-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">
              {row.label}{' '}
              <span
                className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={
                  row.enabled
                    ? { backgroundColor: 'var(--color-brand-muted)', color: 'var(--color-brand)' }
                    : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }
                }
              >
                {row.enabled ? 'Actif' : 'Coupé'}
              </span>
            </p>
            <p className="text-sm text-[color:var(--muted-foreground)]">{row.description}</p>
            {!row.enabled && row.reason ? (
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">Motif : {row.reason}</p>
            ) : null}
          </div>

          <form action={formAction} className="flex shrink-0 items-center gap-2">
            <input type="hidden" name="enabled" value={row.enabled ? 'false' : 'true'} />
            {row.enabled ? (
              <Input name="reason" placeholder="Motif (facultatif)" maxLength={120} className="w-48" />
            ) : null}
            <SubmitButton size="sm" variant="secondary">
              {row.enabled ? 'Couper' : 'Activer'}
            </SubmitButton>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
