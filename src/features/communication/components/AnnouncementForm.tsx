'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { AUDIENCE_ROLES } from '@/features/communication/schemas';
import type { FormState } from '@/lib/forms';

type Defaults = {
  title?: string;
  body?: string;
  all?: boolean;
  roles?: string[];
  classIds?: string[];
  levelIds?: string[];
  expiresAt?: string | null;
};

export type AudienceOption = { id: string; label: string };

export function AnnouncementForm({
  action,
  defaults = {},
  classes = [],
  levels = [],
  submitLabel = 'Créer le brouillon',
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: Defaults;
  classes?: AudienceOption[];
  levels?: AudienceOption[];
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const roles = new Set(defaults.roles ?? []);
  const [tout, setTout] = useState(defaults.all ?? false);
  const classesChoisies = new Set(defaults.classIds ?? []);
  const niveauxChoisis = new Set(defaults.levelIds ?? []);

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
              <input
                type="checkbox"
                name="all"
                checked={tout}
                onChange={(e) => setTout(e.target.checked)}
                className="size-4"
              />
              Tout l’établissement
            </label>

            <div hidden={tout} className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium text-[color:var(--muted-foreground)]">Fonctions</p>
                <div className="flex flex-wrap gap-3">
                  {AUDIENCE_ROLES.filter((r) => r.code !== 'ALL').map((r) => (
                    <label key={r.code} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="roles" value={r.code} defaultChecked={roles.has(r.code)} className="size-4" />
                      {r.label}
                    </label>
                  ))}
                </div>
              </div>

              {levels.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-[color:var(--muted-foreground)]">Niveaux</p>
                  <div className="flex flex-wrap gap-3">
                    {levels.map((l) => (
                      <label key={l.id} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="levelIds" value={l.id} defaultChecked={niveauxChoisis.has(l.id)} className="size-4" />
                        {l.label}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {classes.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-[color:var(--muted-foreground)]">Classes</p>
                  <div className="flex max-h-40 flex-wrap gap-3 overflow-y-auto rounded-xl border p-2">
                    {classes.map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="classIds" value={c.id} defaultChecked={classesChoisies.has(c.id)} className="size-4" />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <p className="text-xs text-[color:var(--muted-foreground)]">
                Une classe atteint les parents de ses élèves, les élèves qui ont un compte et ses enseignants. En
                cochant <strong>aussi</strong> une fonction, vous restreignez — « Parents » + « 6ᵉ 1 » n’écrit qu’aux
                parents de cette classe.
              </p>
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
