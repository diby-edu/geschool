'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormSection as Section } from '@/components/ui/form-section';
import { ChoiceCards } from '@/components/ui/choice-cards';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { DIPLOMAS, EMPLOYMENT_OPTIONS } from '@/lib/hr';
import { STAFF_FUNCTIONS, roleLabel } from '@/lib/permissions/roles';
import { FUNCTION_HINTS } from '../labels';

export type StaffFormValues = Partial<
  Record<
    | 'lastName'
    | 'firstName'
    | 'gender'
    | 'employmentType'
    | 'birthDate'
    | 'birthPlace'
    | 'phone'
    | 'phone2'
    | 'email'
    | 'diploma'
    | 'diplomaDetail'
    | 'staffNumber'
    | 'hireDate'
    | 'functions',
    string
  >
>;

/**
 * Formulaire du personnel administratif. Création : le téléphone principal devient
 * l'identifiant de connexion. Modification : il ne change plus (il porte l'accès).
 */
export function StaffForm({
  action,
  mode,
  defaultValues = {},
  submitLabel,
  phoneDisplay,
  functionsLocked = false,
  functionsNote,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  mode: 'create' | 'edit';
  defaultValues?: StaffFormValues;
  submitLabel: string;
  /** Modification : numéro de connexion, en lecture seule. */
  phoneDisplay?: string | null;
  /** Fondateur, soi-même, ou droit manquant : les fonctions s'affichent sans pouvoir changer. */
  functionsLocked?: boolean;
  functionsNote?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = { ...defaultValues, ...(state.values ?? {}) };
  const err = state.fieldErrors ?? {};
  const chosen = new Set((v.functions ?? '').split(',').filter(Boolean));

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-6">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}

          <Section title="Identité">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom" htmlFor="lastName" required errors={err.lastName}>
                <Input id="lastName" name="lastName" defaultValue={v.lastName} required autoFocus />
              </Field>
              <Field label="Prénom" htmlFor="firstName" required errors={err.firstName}>
                <Input id="firstName" name="firstName" defaultValue={v.firstName} required />
              </Field>
              <Field label="Sexe" htmlFor="gender" required errors={err.gender}>
                <Select id="gender" name="gender" defaultValue={v.gender ?? ''} required>
                  <option value="" disabled>
                    — Sélectionner —
                  </option>
                  <option value="F">Féminin</option>
                  <option value="M">Masculin</option>
                </Select>
              </Field>
              <Field label="Date de naissance" htmlFor="birthDate" errors={err.birthDate} hint="Facultatif">
                <Input id="birthDate" name="birthDate" type="date" defaultValue={v.birthDate} />
              </Field>
              <Field label="Lieu de naissance" htmlFor="birthPlace" errors={err.birthPlace} hint="Facultatif">
                <Input id="birthPlace" name="birthPlace" defaultValue={v.birthPlace} />
              </Field>
            </div>
            <ChoiceCards
              name="employmentType"
              legend="Type de contrat"
              options={EMPLOYMENT_OPTIONS}
              defaultValue={v.employmentType}
              required
              error={err.employmentType}
            />
          </Section>

          <Section
            title="Fonctions"
            hint="Une personne peut cumuler plusieurs fonctions. Ses droits sont l’ensemble de ceux des fonctions choisies."
          >
            {err.functions ? <p className="text-sm text-[color:var(--color-danger)]">{err.functions[0]}</p> : null}
            {/* Indique que les fonctions sont modifiables : « aucune case cochée » est alors une erreur, pas un « pas de changement ». */}
            {mode === 'edit' && !functionsLocked ? <input type="hidden" name="functionsEditable" value="1" /> : null}
            {functionsNote ? <p className="text-xs text-[color:var(--muted-foreground)]">{functionsNote}</p> : null}
            <ul className="grid gap-2 sm:grid-cols-2">
              {STAFF_FUNCTIONS.map((code) => (
                <li key={code}>
                  <label
                    className={`flex items-start gap-2.5 rounded-[--radius-card] border px-3 py-2 ${
                      functionsLocked ? 'opacity-70' : 'cursor-pointer hover:bg-[color:var(--color-brand-muted)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="functions"
                      value={code}
                      defaultChecked={chosen.has(code)}
                      disabled={functionsLocked}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--color-brand)]"
                    />
                    <span className="text-sm leading-snug">
                      <span className="font-medium">{roleLabel(code)}</span>
                      <span className="mt-0.5 block text-xs text-[color:var(--muted-foreground)]">{FUNCTION_HINTS[code]}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Coordonnées"
            hint={mode === 'create' ? 'Le téléphone principal sert d’identifiant de connexion.' : undefined}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {mode === 'create' ? (
                <Field label="Téléphone principal" htmlFor="phone" required errors={err.phone} hint="Format local accepté">
                  <Input id="phone" name="phone" defaultValue={v.phone} placeholder="07 08 09 00 01" required />
                </Field>
              ) : (
                <div>
                  <p className="mb-1 text-sm font-medium">Téléphone de connexion</p>
                  <p className="rounded-[--radius-card] border px-3 py-2 font-mono text-sm">{phoneDisplay ?? '—'}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">Il porte l’accès : il ne se modifie pas ici.</p>
                </div>
              )}
              <Field label="Second téléphone" htmlFor="phone2" errors={err.phone2} hint="Facultatif">
                <Input id="phone2" name="phone2" defaultValue={v.phone2} />
              </Field>
              <Field label="E-mail" htmlFor="email" errors={err.email} hint="Recommandé pour la récupération du mot de passe">
                <Input id="email" name="email" type="email" defaultValue={v.email} />
              </Field>
            </div>
          </Section>

          <Section title="Diplôme et poste">
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
              <Field label="Précision du diplôme" htmlFor="diplomaDetail" errors={err.diplomaDetail} hint="Ex. Licence en droit">
                <Input id="diplomaDetail" name="diplomaDetail" defaultValue={v.diplomaDetail} />
              </Field>
              <Field label="Matricule" htmlFor="staffNumber" errors={err.staffNumber} hint="Laissez vide : « en cours »">
                <Input id="staffNumber" name="staffNumber" defaultValue={v.staffNumber} placeholder="En cours" />
              </Field>
              <Field label="Date de prise de fonction" htmlFor="hireDate" errors={err.hireDate} hint="Facultatif">
                <Input id="hireDate" name="hireDate" type="date" defaultValue={v.hireDate} />
              </Field>
            </div>
          </Section>

          <div className="pt-1">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
