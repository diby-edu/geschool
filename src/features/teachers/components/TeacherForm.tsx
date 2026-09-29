'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { FormSection } from '@/components/ui/form-section';
import { ChoiceCards } from '@/components/ui/choice-cards';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { DIPLOMAS, EMPLOYMENT_OPTIONS } from '@/lib/hr';
import type { FormState } from '@/lib/forms';

type Values = Partial<
  Record<
    | 'staffNumber'
    | 'firstName'
    | 'lastName'
    | 'gender'
    | 'birthDate'
    | 'phone'
    | 'email'
    | 'address'
    | 'specialty'
    | 'employmentType'
    | 'status'
    | 'hireDate'
    | 'diploma'
    | 'diplomaDetail'
    | 'minSessions'
    | 'maxSessions',
    string
  >
>;

export function TeacherForm({
  action,
  defaultValues = {},
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultValues?: Values;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = { ...defaultValues, ...(state.values ?? {}) };
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-6">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <FormSection title="Identité">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom" htmlFor="lastName" required errors={err.lastName}>
                <Input id="lastName" name="lastName" defaultValue={v.lastName} required autoFocus />
              </Field>
              <Field label="Prénom" htmlFor="firstName" required errors={err.firstName}>
                <Input id="firstName" name="firstName" defaultValue={v.firstName} required />
              </Field>
              <Field label="Sexe" htmlFor="gender" errors={err.gender}>
                <Select id="gender" name="gender" defaultValue={v.gender ?? ''}>
                  <option value="">—</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                  <option value="OTHER">Autre</option>
                </Select>
              </Field>
              <Field label="Date de naissance" htmlFor="birthDate" errors={err.birthDate} hint="Facultatif">
                <Input id="birthDate" name="birthDate" type="date" defaultValue={v.birthDate} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Coordonnées" hint="Le téléphone sert d’identifiant de connexion (code école + téléphone).">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Téléphone" htmlFor="phone" errors={err.phone} hint="Format local accepté">
                <Input id="phone" name="phone" defaultValue={v.phone} placeholder="01 02 03 04 05" />
              </Field>
              <Field label="E-mail" htmlFor="email" errors={err.email} hint="Facultatif">
                <Input id="email" name="email" type="email" defaultValue={v.email} />
              </Field>
            </div>
            <Field label="Adresse" htmlFor="address" errors={err.address} hint="Facultatif">
              <Input id="address" name="address" defaultValue={v.address} placeholder="Quartier, commune" />
            </Field>
          </FormSection>

          <FormSection title="Poste">
            <ChoiceCards
              name="employmentType"
              legend="Type de contrat"
              options={EMPLOYMENT_OPTIONS}
              defaultValue={v.employmentType ?? 'PERMANENT'}
              required
              error={err.employmentType}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Matricule" htmlFor="staffNumber" required errors={err.staffNumber}>
                <Input id="staffNumber" name="staffNumber" defaultValue={v.staffNumber} required />
              </Field>
              <Field label="Spécialité" htmlFor="specialty" errors={err.specialty}>
                <Input id="specialty" name="specialty" defaultValue={v.specialty} placeholder="Ex. Mathématiques" />
              </Field>
              <Field label="Date de prise de fonction" htmlFor="hireDate" errors={err.hireDate} hint="Facultatif">
                <Input id="hireDate" name="hireDate" type="date" defaultValue={v.hireDate} />
              </Field>
              <Field label="Statut" htmlFor="status" errors={err.status}>
                <Select id="status" name="status" defaultValue={v.status ?? 'ACTIVE'}>
                  <option value="ACTIVE">Actif</option>
                  <option value="ON_LEAVE">En congé</option>
                  <option value="SUSPENDED">Suspendu</option>
                  <option value="LEFT">Parti</option>
                </Select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Formation">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Diplôme" htmlFor="diploma" errors={err.diploma} hint="Le plus élevé obtenu">
                <Select id="diploma" name="diploma" defaultValue={v.diploma ?? ''}>
                  <option value="">— Sélectionner —</option>
                  {DIPLOMAS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Précision du diplôme" htmlFor="diplomaDetail" errors={err.diplomaDetail} hint="Ex. Licence en mathématiques">
                <Input id="diplomaDetail" name="diplomaDetail" defaultValue={v.diplomaDetail} />
              </Field>
            </div>

            {/*
              Service hebdomadaire : le plafond alerte sur la grille d'affectation
              AVANT la génération de l'emploi du temps. Laisser vide si l'école
              ne fixe pas de borne.
            */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Service minimum"
                htmlFor="minSessions"
                errors={err.minSessions}
                hint="En séances par semaine. Vide = pas de minimum."
              >
                <Input id="minSessions" name="minSessions" type="number" min="0" max="60" defaultValue={v.minSessions} placeholder="—" />
              </Field>
              <Field
                label="Service maximum"
                htmlFor="maxSessions"
                errors={err.maxSessions}
                hint="Alerte si les affectations le dépassent."
              >
                <Input id="maxSessions" name="maxSessions" type="number" min="0" max="60" defaultValue={v.maxSessions} placeholder="—" />
              </Field>
            </div>
          </FormSection>

          <div className="pt-1">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
