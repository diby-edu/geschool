'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

type Values = Partial<
  Record<'staffNumber' | 'firstName' | 'lastName' | 'gender' | 'phone' | 'email' | 'specialty' | 'employmentType' | 'status', string>
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
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Matricule" htmlFor="staffNumber" required errors={err.staffNumber}>
              <Input id="staffNumber" name="staffNumber" defaultValue={v.staffNumber} required autoFocus />
            </Field>
            <Field label="Sexe" htmlFor="gender" errors={err.gender}>
              <Select id="gender" name="gender" defaultValue={v.gender ?? ''}>
                <option value="">—</option>
                <option value="M">Masculin</option>
                <option value="F">Feminin</option>
                <option value="OTHER">Autre</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prenom" htmlFor="firstName" required errors={err.firstName}>
              <Input id="firstName" name="firstName" defaultValue={v.firstName} required />
            </Field>
            <Field label="Nom" htmlFor="lastName" required errors={err.lastName}>
              <Input id="lastName" name="lastName" defaultValue={v.lastName} required />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telephone" htmlFor="phone" errors={err.phone} hint="Format local accepte">
              <Input id="phone" name="phone" defaultValue={v.phone} placeholder="01 02 03 04 05" />
            </Field>
            <Field label="Email" htmlFor="email" errors={err.email}>
              <Input id="email" name="email" type="email" defaultValue={v.email} />
            </Field>
          </div>

          <Field label="Specialite" htmlFor="specialty" errors={err.specialty}>
            <Input id="specialty" name="specialty" defaultValue={v.specialty} placeholder="Ex. Mathematiques" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type de contrat" htmlFor="employmentType" errors={err.employmentType}>
              <Select id="employmentType" name="employmentType" defaultValue={v.employmentType ?? 'PERMANENT'}>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contractuel</option>
                <option value="HOURLY">Vacataire</option>
                <option value="INTERN">Stagiaire</option>
                <option value="OTHER">Autre</option>
              </Select>
            </Field>
            <Field label="Statut" htmlFor="status" errors={err.status}>
              <Select id="status" name="status" defaultValue={v.status ?? 'ACTIVE'}>
                <option value="ACTIVE">Actif</option>
                <option value="ON_LEAVE">En conge</option>
                <option value="SUSPENDED">Suspendu</option>
                <option value="LEFT">Parti</option>
              </Select>
            </Field>
          </div>

          <div className="pt-2">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
