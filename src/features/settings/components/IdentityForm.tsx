'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';

const TRACK_CHOICES = [
  { code: 'GENERAL', label: 'Enseignement général', hint: 'Trimestres · 6e à Terminale' },
  { code: 'TECHNIQUE', label: 'Enseignement technique', hint: 'Semestres · séries B, F, G…' },
  { code: 'PROFESSIONNEL', label: 'Formation professionnelle', hint: 'Semestres · CAP, BEP, BT…' },
] as const;

export type IdentityValues = Partial<
  Record<
    'name' | 'shortName' | 'directorName' | 'registrationNumber' | 'address' | 'neighborhood' | 'city' | 'phone' | 'email' | 'website',
    string
  >
>;

export function IdentityForm({
  action,
  defaultValues,
  educationTracks = [],
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaultValues: IdentityValues;
  /** Ordres d'enseignement cochés aujourd'hui. */
  educationTracks?: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = { ...defaultValues, ...(state.values ?? {}) };
  const err = state.fieldErrors ?? {};

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-6">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">Ordres d’enseignement</h2>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Ce que votre établissement enseigne. C’est ce choix qui décide des niveaux officiels proposés, du découpage
              de l’année (trimestres pour le général, semestres pour le technique et le professionnel) et des congés.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {TRACK_CHOICES.map((t) => (
                <label
                  key={t.code}
                  className="flex cursor-pointer items-center gap-2 rounded-2xl border p-3 text-sm"
                  style={{ backgroundColor: 'var(--surface)' }}
                >
                  <input
                    type="checkbox"
                    name="educationTracks"
                    value={t.code}
                    defaultChecked={educationTracks.includes(t.code)}
                    className="size-4"
                  />
                  <span>
                    <span className="font-semibold">{t.label}</span>
                    <br />
                    <span className="text-xs text-[color:var(--muted-foreground)]">{t.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {err.educationTracks ? (
              <p className="text-xs text-[color:var(--color-danger)]">{err.educationTracks.join(' ')}</p>
            ) : null}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">Identité</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom de l’établissement" htmlFor="name" required errors={err.name}>
                <Input id="name" name="name" defaultValue={v.name} required autoFocus />
              </Field>
              <Field label="Nom court" htmlFor="shortName" errors={err.shortName} hint="Affiché dans le menu et les SMS">
                <Input id="shortName" name="shortName" defaultValue={v.shortName} />
              </Field>
              <Field label="Directeur" htmlFor="directorName" errors={err.directorName} hint="Nom tel qu’il figure sur les documents">
                <Input id="directorName" name="directorName" defaultValue={v.directorName} />
              </Field>
              <Field label="Code officiel" htmlFor="registrationNumber" errors={err.registrationNumber} hint="Numéro d’agrément ou de reconnaissance">
                <Input id="registrationNumber" name="registrationNumber" defaultValue={v.registrationNumber} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">Localisation et contact</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ville" htmlFor="city" errors={err.city}>
                <Input id="city" name="city" defaultValue={v.city} />
              </Field>
              <Field label="Quartier" htmlFor="neighborhood" errors={err.neighborhood}>
                <Input id="neighborhood" name="neighborhood" defaultValue={v.neighborhood} />
              </Field>
              <Field label="Adresse" htmlFor="address" errors={err.address}>
                <Input id="address" name="address" defaultValue={v.address} />
              </Field>
              <Field label="Téléphone" htmlFor="phone" errors={err.phone} hint="Format local accepté">
                <Input id="phone" name="phone" defaultValue={v.phone} />
              </Field>
              <Field label="E-mail" htmlFor="email" errors={err.email}>
                <Input id="email" name="email" type="email" defaultValue={v.email} />
              </Field>
              <Field label="Site web" htmlFor="website" errors={err.website}>
                <Input id="website" name="website" defaultValue={v.website} placeholder="https://" />
              </Field>
            </div>
          </section>

          <SubmitButton>Enregistrer</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
