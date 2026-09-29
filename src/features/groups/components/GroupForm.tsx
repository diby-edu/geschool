'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { GROUP_KINDS, GROUP_KIND_LABELS, type GroupKind } from '@/features/groups/kinds';

type Opt = { id: string; name: string };

/**
 * Créer ou modifier un groupe.
 *
 * Le choix des classes est la partie qui compte : c'est lui qui décide dans
 * quel vivier on ira chercher les élèves. Une seule classe pour un demi-groupe
 * de travaux pratiques ; toutes les 4èmes pour rassembler les germanistes, qui
 * ne sont jamais assez nombreux dans une seule classe.
 */
export function GroupForm({
  action,
  classes,
  subjects,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  classes: Opt[];
  subjects: Opt[];
  defaults?: {
    code: string;
    name: string;
    kind: string;
    subjectId: string;
    maxSize: string;
    classIds: string[];
  };
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};
  const [kind, setKind] = useState<GroupKind>((defaults?.kind as GroupKind) ?? 'LANGUAGE');
  const chosen = new Set(defaults?.classIds ?? []);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-5">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom" htmlFor="name" required errors={err.name} hint="Ce que liront les familles : « Espagnol LV2 ».">
              <Input id="name" name="name" defaultValue={v.name ?? defaults?.name ?? ''} required autoFocus />
            </Field>
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Court : il apparaît sur l’emploi du temps.">
              <Input id="code" name="code" defaultValue={v.code ?? defaults?.code ?? ''} required className="font-mono" />
            </Field>
          </div>

          <Field label="Type" htmlFor="kind" required errors={err.kind}>
            <Select
              id="kind"
              name="kind"
              required
              value={kind}
              onChange={(e) => setKind(e.target.value as GroupKind)}
            >
              {GROUP_KINDS.map((k) => (
                <option key={k} value={k}>
                  {GROUP_KIND_LABELS[k].title}
                </option>
              ))}
            </Select>
          </Field>
          <p className="-mt-3 text-xs text-[color:var(--muted-foreground)]">{GROUP_KIND_LABELS[kind].hint}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Matière"
              htmlFor="subjectId"
              errors={err.subjectId}
              hint="Celle enseignée à ce groupe. Un club n’en a pas."
            >
              <Select id="subjectId" name="subjectId" defaultValue={v.subjectId ?? defaults?.subjectId ?? ''}>
                <option value="">—</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Effectif maximum" htmlFor="maxSize" errors={err.maxSize} hint="Facultatif.">
              <Input
                id="maxSize"
                name="maxSize"
                type="number"
                min="1"
                max="500"
                defaultValue={v.maxSize ?? defaults?.maxSize ?? ''}
              />
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Classes d’où viennent les élèves</legend>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Seuls les élèves de ces classes pourront entrer dans le groupe.
            </p>
            {err.classIds ? <Alert tone="error">{err.classIds.join(' ')}</Alert> : null}
            <div className="grid max-h-64 gap-1 overflow-y-auto rounded-[--radius-card] border p-2 sm:grid-cols-3">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm">
                  <input type="checkbox" name="classIds" value={c.id} defaultChecked={chosen.has(c.id)} className="size-4" />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>

          <SubmitButton>{submitLabel}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
