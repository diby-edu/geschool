'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { createSchoolAction } from '../actions';
import type { FormState } from '@/lib/forms';

export function CreateSchoolForm() {
  const [state, formAction] = useActionState<FormState, FormData>(createSchoolAction, {});
  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <Field label="Nom de l'etablissement" htmlFor="name" required errors={err.name}>
            <Input id="name" name="name" defaultValue={v.name} required autoFocus placeholder="Lycee Moderne d'Abidjan" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug (URL)" htmlFor="slug" required errors={err.slug} hint="Ex. lycee-moderne — /e/lycee-moderne">
              <Input id="slug" name="slug" defaultValue={v.slug} required placeholder="lycee-moderne" />
            </Field>
            <Field label="Sigle" htmlFor="shortName" errors={err.shortName}>
              <Input id="shortName" name="shortName" defaultValue={v.shortName} placeholder="LMA" />
            </Field>
          </div>

          <Field label="Type" htmlFor="schoolType" errors={err.schoolType}>
            <Select id="schoolType" name="schoolType" defaultValue={v.schoolType ?? 'SECONDARY'}>
              <option value="PRIMARY">Primaire</option>
              <option value="SECONDARY">Secondaire (college)</option>
              <option value="HIGH_SCHOOL">Lycee</option>
              <option value="TECHNICAL">Technique</option>
              <option value="MIXED">Mixte</option>
              <option value="OTHER">Autre</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Pays" htmlFor="countryCode" errors={err.countryCode}>
              <Input id="countryCode" name="countryCode" defaultValue={v.countryCode ?? 'CI'} maxLength={2} />
            </Field>
            <Field label="Devise" htmlFor="currency" errors={err.currency}>
              <Input id="currency" name="currency" defaultValue={v.currency ?? 'XOF'} maxLength={3} />
            </Field>
            <Field label="Langue" htmlFor="locale" errors={err.locale}>
              <Input id="locale" name="locale" defaultValue={v.locale ?? 'fr-CI'} />
            </Field>
          </div>

          <Field label="Fuseau horaire" htmlFor="timezone" errors={err.timezone}>
            <Input id="timezone" name="timezone" defaultValue={v.timezone ?? 'Africa/Abidjan'} />
          </Field>

          <div className="pt-2">
            <SubmitButton>Creer l&apos;etablissement</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
