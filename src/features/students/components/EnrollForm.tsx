'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Opt = { id: string; name: string };

function GuardianFields({ i, title }: { i: 1 | 2; title: string }) {
  return (
    <fieldset className="space-y-3 rounded-[--radius-card] border p-3">
      <legend className="px-1 text-xs font-medium text-[color:var(--muted-foreground)]">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prenom" htmlFor={`g${i}_firstName`}>
          <Input id={`g${i}_firstName`} name={`g${i}_firstName`} />
        </Field>
        <Field label="Nom" htmlFor={`g${i}_lastName`}>
          <Input id={`g${i}_lastName`} name={`g${i}_lastName`} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Telephone" htmlFor={`g${i}_phone`} hint="Sert d'identifiant de connexion">
          <Input id={`g${i}_phone`} name={`g${i}_phone`} placeholder="01 02 03 04 05" />
        </Field>
        <Field label="Lien" htmlFor={`g${i}_relationship`}>
          <Select id={`g${i}_relationship`} name={`g${i}_relationship`} defaultValue={i === 1 ? 'FATHER' : 'MOTHER'}>
            <option value="FATHER">Pere</option>
            <option value="MOTHER">Mere</option>
            <option value="TUTOR">Tuteur</option>
            <option value="LEGAL_GUARDIAN">Responsable legal</option>
            <option value="OTHER">Autre</option>
          </Select>
        </Field>
      </div>
    </fieldset>
  );
}

export function EnrollForm({
  action,
  classes,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  classes: Opt[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-5">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Eleve
            </h2>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prenom" htmlFor="firstName" required errors={err.firstName}>
                  <Input id="firstName" name="firstName" defaultValue={v.firstName} required autoFocus />
                </Field>
                <Field label="Nom" htmlFor="lastName" required errors={err.lastName}>
                  <Input id="lastName" name="lastName" defaultValue={v.lastName} required />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Sexe" htmlFor="gender" errors={err.gender}>
                  <Select id="gender" name="gender" defaultValue={v.gender ?? ''}>
                    <option value="">—</option>
                    <option value="M">Masculin</option>
                    <option value="F">Feminin</option>
                    <option value="OTHER">Autre</option>
                  </Select>
                </Field>
                <Field label="Naissance" htmlFor="birthDate" errors={err.birthDate}>
                  <Input id="birthDate" name="birthDate" type="date" defaultValue={v.birthDate} />
                </Field>
                <Field label="Classe" htmlFor="classId" required errors={err.classId}>
                  <Select id="classId" name="classId" required defaultValue={v.classId ?? ''}>
                    <option value="" disabled>
                      —
                    </option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Responsables legaux
            </h2>
            <p className="mb-3 text-xs text-[color:var(--muted-foreground)]">
              Renseignez au moins un responsable. Un compte parent (identifiant = telephone) est
              cree automatiquement pour chacun ; laissez vide pour en omettre un.
            </p>
            <div className="space-y-3">
              <GuardianFields i={1} title="Responsable 1" />
              <GuardianFields i={2} title="Responsable 2 (facultatif)" />
            </div>
          </div>

          <SubmitButton>Inscrire l&apos;eleve</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
