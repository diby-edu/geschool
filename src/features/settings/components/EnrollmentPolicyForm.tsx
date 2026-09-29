'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { MATRICULE_MODES, MATRICULE_MODE_LABELS, type MatriculeMode } from '@/features/settings/enrollment-policy-types';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** D'où vient le matricule d'un élève : de l'État, ou de l'établissement. */
export function EnrollmentPolicyForm({ action, matricule }: { action: Action; matricule: MatriculeMode }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Le matricule de l’élève</p>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Ce réglage décide si le secrétariat doit saisir le matricule ou si l’application l’attribue. Il
            s’applique aux deux portes : l’inscription une par une et l’import de listes.
          </p>
        </div>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          {MATRICULE_MODES.map((m) => (
            <label
              key={m}
              className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              <input type="radio" name="matriculeMode" value={m} defaultChecked={matricule === m} className="mt-0.5 size-4" />
              <span>
                <span className="font-semibold">{MATRICULE_MODE_LABELS[m].title}</span>
                <br />
                <span className="text-xs text-[color:var(--muted-foreground)]">{MATRICULE_MODE_LABELS[m].hint}</span>
              </span>
            </label>
          ))}
          <SubmitButton>Enregistrer</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
