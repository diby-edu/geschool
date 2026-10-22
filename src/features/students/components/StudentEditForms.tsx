'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export type StudentIdentity = {
  matricule: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  birth_date: string | null;
  birth_place: string | null;
  is_state_assigned: boolean | null;
};

export type GuardianLink = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
};

/** Valeurs d'un formulaire de responsable : celles du dossier, ou celles renvoyées après une erreur. */
type GuardianDraft = { [K in keyof GuardianLink]?: GuardianLink[K] | undefined };

const REL_OPTIONS: [string, string][] = [
  ['FATHER', 'Père'],
  ['MOTHER', 'Mère'],
  ['TUTOR', 'Tuteur'],
  ['LEGAL_GUARDIAN', 'Responsable légal'],
  ['SIBLING', 'Fratrie'],
  ['OTHER', 'Autre'],
];

/** L'identité de l'élève, préremplie avec son dossier actuel. */
export function StudentIdentityForm({ action, student, matriculeRequired }: { action: Action; student: StudentIdentity; matriculeRequired: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = state.values;
  const err = state.fieldErrors ?? {};
  const val = (k: string, fallback: string) => (v ? (v[k] ?? '') : fallback);
  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom" htmlFor="lastName" required errors={err.lastName}>
              <Input id="lastName" name="lastName" defaultValue={val('lastName', student.last_name)} required />
            </Field>
            <Field label="Prénom" htmlFor="firstName" required errors={err.firstName}>
              <Input id="firstName" name="firstName" defaultValue={val('firstName', student.first_name)} required />
            </Field>
          </div>
          <Field
            label="Matricule"
            htmlFor="matricule"
            required={matriculeRequired}
            errors={err.matricule}
            hint="Le numéro attribué par l’État. Il doit rester unique dans l’établissement."
          >
            <Input id="matricule" name="matricule" defaultValue={val('matricule', student.matricule)} required={matriculeRequired} className="font-mono" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sexe" htmlFor="gender" required errors={err.gender}>
              <Select id="gender" name="gender" required defaultValue={val('gender', student.gender ?? '')}>
                <option value="" disabled>
                  —
                </option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
                <option value="OTHER">Autre</option>
              </Select>
            </Field>
            <Field label="Date de naissance" htmlFor="birthDate" required errors={err.birthDate}>
              <Input id="birthDate" name="birthDate" type="date" defaultValue={val('birthDate', student.birth_date ?? '')} required />
            </Field>
            <Field label="Lieu de naissance" htmlFor="birthPlace" required errors={err.birthPlace}>
              <Input id="birthPlace" name="birthPlace" defaultValue={val('birthPlace', student.birth_place ?? '')} required />
            </Field>
          </div>
          <Field label="Statut" htmlFor="isStateAssigned" required errors={err.isStateAssigned}>
            <Select
              id="isStateAssigned"
              name="isStateAssigned"
              required
              defaultValue={val('isStateAssigned', student.is_state_assigned === null ? '' : student.is_state_assigned ? '1' : '0')}
            >
              <option value="" disabled>
                —
              </option>
              <option value="1">Affecté</option>
              <option value="0">Non affecté</option>
            </Select>
          </Field>
          <div className="flex justify-end">
            <SubmitButton>Enregistrer les corrections</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Les champs d'un responsable, partagés par la modification et l'ajout. */
function GuardianFields({ prefix, g, err }: { prefix: string; g: GuardianDraft; err: Record<string, string[]> }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom" htmlFor={`${prefix}-lastName`} required errors={err.lastName}>
          <Input id={`${prefix}-lastName`} name="lastName" defaultValue={g.lastName ?? ''} required />
        </Field>
        <Field label="Prénom" htmlFor={`${prefix}-firstName`} required errors={err.firstName}>
          <Input id={`${prefix}-firstName`} name="firstName" defaultValue={g.firstName ?? ''} required />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Téléphone" htmlFor={`${prefix}-phone`} required errors={err.phone} hint="Sert d’identifiant de connexion du parent.">
          <Input id={`${prefix}-phone`} name="phone" defaultValue={g.phone ?? ''} placeholder="07 00 00 00 01" required />
        </Field>
        <Field label="Lien avec l’élève" htmlFor={`${prefix}-relationship`} required errors={err.relationship}>
          <Select id={`${prefix}-relationship`} name="relationship" required defaultValue={g.relationship ?? ''}>
            <option value="" disabled>
              —
            </option>
            {REL_OPTIONS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPrimaryContact" defaultChecked={g.isPrimary ?? false} /> Contact principal (premier appelé, premier destinataire des messages)
      </label>
    </>
  );
}

/** Un responsable déjà rattaché : modifier, ou retirer de cet élève. */
export function GuardianCard({
  guardian,
  update,
  detach,
}: {
  guardian: GuardianLink;
  /** Absent : pas le droit de modifier (lecture seule). */
  update?: Action | undefined;
  /** Absent : pas le droit de retirer. */
  detach?: Action | undefined;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(update ?? (async () => ({})), {});
  const values = state.values;
  const g: GuardianDraft = values
    ? { ...guardian, firstName: values.firstName, lastName: values.lastName, phone: values.phone, relationship: values.relationship, isPrimary: values.isPrimaryContact === 'on' }
    : guardian;
  return (
    <Card>
      <CardContent className="space-y-3">
        {update ? (
          <form action={formAction} className="space-y-3">
            {state.error ? <Alert tone="error">{state.error}</Alert> : null}
            <GuardianFields prefix={`g-${guardian.id}`} g={g} err={state.fieldErrors ?? {}} />
            <div className="flex justify-end">
              <SubmitButton>Enregistrer</SubmitButton>
            </div>
          </form>
        ) : (
          <p className="text-sm">
            <span className="font-medium">
              {guardian.lastName.toUpperCase()} {guardian.firstName}
            </span>{' '}
            · {guardian.phone}
          </p>
        )}
        {detach ? (
          <div className="border-t pt-3">
            <ConfirmSubmit
              action={detach}
              label="Retirer de cet élève"
              confirmMessage={`Retirer ${guardian.firstName} ${guardian.lastName} des responsables de cet élève ? Sa fiche reste, s’il a d’autres enfants dans l’établissement.`}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Ajouter un responsable : retrouvé par son téléphone, ou créé avec son accès Parent. */
export function AddGuardianForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const values = state.values;
  const g: GuardianDraft = values
    ? { firstName: values.firstName, lastName: values.lastName, phone: values.phone, relationship: values.relationship, isPrimary: values.isPrimaryContact === 'on' }
    : {};
  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Si ce numéro est déjà celui d’un parent de l’établissement (un frère ou une sœur scolarisé ici), il est simplement rattaché à cet élève. Sinon, son accès Parent est créé ; ses identifiants s’envoient depuis « Gestion des accès ».
          </p>
          <GuardianFields prefix="nouveau" g={g} err={state.fieldErrors ?? {}} />
          <div className="flex justify-end">
            <SubmitButton>Ajouter ce responsable</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
