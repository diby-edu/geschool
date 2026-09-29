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
        <Field label="Prénom" htmlFor={`g${i}_firstName`}>
          <Input id={`g${i}_firstName`} name={`g${i}_firstName`} />
        </Field>
        <Field label="Nom" htmlFor={`g${i}_lastName`}>
          <Input id={`g${i}_lastName`} name={`g${i}_lastName`} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Téléphone" htmlFor={`g${i}_phone`} hint="Sert d'identifiant de connexion">
          <Input id={`g${i}_phone`} name={`g${i}_phone`} placeholder="01 02 03 04 05" />
        </Field>
        <Field label="Lien" htmlFor={`g${i}_relationship`}>
          <Select id={`g${i}_relationship`} name={`g${i}_relationship`} defaultValue={i === 1 ? 'FATHER' : 'MOTHER'}>
            <option value="FATHER">Père</option>
            <option value="MOTHER">Mère</option>
            <option value="TUTOR">Tuteur</option>
            <option value="LEGAL_GUARDIAN">Responsable légal</option>
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
  matriculeRequired,
  languages,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  classes: Opt[];
  /** L'État fournit le matricule : la saisie est alors obligatoire. */
  matriculeRequired: boolean;
  /** Les langues vivantes 2 déjà ouvertes dans l'école. */
  languages: string[];
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
              Élève
            </h2>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prénom" htmlFor="firstName" required errors={err.firstName}>
                  <Input id="firstName" name="firstName" defaultValue={v.firstName} required autoFocus />
                </Field>
                <Field label="Nom" htmlFor="lastName" required errors={err.lastName}>
                  <Input id="lastName" name="lastName" defaultValue={v.lastName} required />
                </Field>
              </div>
              <Field
                label="Matricule"
                htmlFor="matricule"
                required={matriculeRequired}
                errors={err.matricule}
                hint={
                  matriculeRequired
                    ? 'Attribué par l\u2019État avant l\u2019inscription. L\u2019application ne l\u2019invente jamais.'
                    : 'Laissé vide, il est attribué automatiquement.'
                }
              >
                <Input
                  id="matricule"
                  name="matricule"
                  defaultValue={v.matricule}
                  required={matriculeRequired}
                  className="font-mono"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Sexe" htmlFor="gender" required errors={err.gender}>
                  <Select id="gender" name="gender" required defaultValue={v.gender ?? ''}>
                    <option value="" disabled>
                      —
                    </option>
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                    <option value="OTHER">Autre</option>
                  </Select>
                </Field>
                <Field label="Date de naissance" htmlFor="birthDate" required errors={err.birthDate}>
                  <Input id="birthDate" name="birthDate" type="date" defaultValue={v.birthDate} required />
                </Field>
                <Field label="Lieu de naissance" htmlFor="birthPlace" required errors={err.birthPlace}>
                  <Input id="birthPlace" name="birthPlace" defaultValue={v.birthPlace} required />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
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
                <Field label="Statut" htmlFor="isStateAssigned" required errors={err.isStateAssigned}>
                  <Select id="isStateAssigned" name="isStateAssigned" required defaultValue={v.isStateAssigned ?? ''}>
                    <option value="" disabled>
                      —
                    </option>
                    <option value="1">Affecté</option>
                    <option value="0">Non affecté</option>
                  </Select>
                </Field>
                <Field
                  label="LV2"
                  htmlFor="lv2"
                  errors={err.lv2}
                  hint="Laissez vide si le niveau n’a pas de LV2 au programme."
                >
                  <Input
                    id="lv2"
                    name="lv2"
                    list="lv2-langues"
                    defaultValue={v.lv2 ?? ''}
                    placeholder={languages[0] ?? 'Allemand, Espagnol…'}
                  />
                  {/* Les langues déjà ouvertes dans l’école, sans interdire d’en
                      saisir une nouvelle : le groupe est créé au besoin. */}
                  <datalist id="lv2-langues">
                    {languages.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Redoublant" htmlFor="isRepeating" errors={err.isRepeating}>
                  <label className="flex h-10 items-center gap-2 text-sm">
                    <input
                      id="isRepeating"
                      type="checkbox"
                      name="isRepeating"
                      defaultChecked={v.isRepeating === 'true' || v.isRepeating === 'on'}
                      className="size-4"
                    />
                    Redouble cette classe
                  </label>
                </Field>
              </div>
              <Field label="Photo" htmlFor="photo" hint="Facultatif — apparaît alors dans l'appel et les notes." errors={err.photo}>
                <input
                  id="photo"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="block w-full text-sm text-[color:var(--muted-foreground)] file:mr-3 file:rounded-[--radius-card] file:border-0 file:bg-[color:var(--color-brand-muted)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[color:var(--color-brand)]"
                />
              </Field>
            </div>
          </div>

          <div>
            <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Responsables légaux
            </h2>
            <p className="mb-3 text-xs text-[color:var(--muted-foreground)]">
              Renseignez au moins un responsable. Un compte parent (identifiant = téléphone) est
              créé automatiquement pour chacun ; laissez vide pour en omettre un.
            </p>
            <div className="space-y-3">
              <GuardianFields i={1} title="Responsable 1" />
              <GuardianFields i={2} title="Responsable 2 (facultatif)" />
            </div>
          </div>

          <SubmitButton>Inscrire l&apos;élève</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
