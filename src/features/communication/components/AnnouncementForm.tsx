'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { AUDIENCE_ROLES } from '@/features/communication/schemas';
import type { FormState } from '@/lib/forms';

type Defaults = { title?: string; body?: string; all?: boolean; roles?: string[]; expiresAt?: string | null };

export function AnnouncementForm({
  action,
  defaults = {},
  submitLabel = 'Créer le brouillon',
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: Defaults;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const roles = new Set(defaults.roles ?? []);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <Field label="Titre" htmlFor="title" required errors={err.title}>
            <Input id="title" name="title" defaultValue={v.title ?? defaults.title ?? ''} required maxLength={160} />
          </Field>
          <Field label="Contenu" htmlFor="body" required errors={err.body}>
            <Textarea id="body" name="body" rows={5} defaultValue={v.body ?? defaults.body ?? ''} required maxLength={5000} />
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Public</legend>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="all" defaultChecked={defaults.all ?? false} className="size-4" />
              Tout l’établissement
            </label>
            <div className="flex flex-wrap gap-3">
              {AUDIENCE_ROLES.filter((r) => r.code !== 'ALL').map((r) => (
                <label key={r.code} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="roles" value={r.code} defaultChecked={roles.has(r.code)} className="size-4" />
                  {r.label}
                </label>
              ))}
            </div>
            {err.roles ? <p className="mt-1 text-xs text-[color:var(--color-danger)]">{err.roles.join(' ')}</p> : null}
          </fieldset>

          <Field label="Expire le (facultatif)" htmlFor="expiresAt" errors={err.expiresAt}>
            <Input id="expiresAt" name="expiresAt" type="date" defaultValue={v.expiresAt ?? defaults.expiresAt ?? ''} />
          </Field>

          <SubmitButton>{submitLabel}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
