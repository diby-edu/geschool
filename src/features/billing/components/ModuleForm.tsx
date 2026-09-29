'use client';

import { useActionState, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { FEATURES } from '@/lib/modules/features';
import type { ModuleRow } from '../modules';

/**
 * Un module vendable. Son CODE est celui qui décide aussi de ce que l'école
 * voit : on propose donc la liste des modules de l'application, pour que
 * « acheté » et « visible » désignent toujours la même chose. Un code libre
 * reste possible, pour vendre autre chose (accompagnement, formation…).
 */
export function ModuleForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: ModuleRow;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const known = FEATURES.find((f) => f.code === defaults?.code);
  const [custom, setCustom] = useState(Boolean(defaults && !known));

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Module de l’application" htmlFor="code" required errors={err.code} hint="Ce que l’école verra ou non.">
          {custom ? (
            <Input id="code" name="code" required defaultValue={defaults?.code} placeholder="ACCOMPAGNEMENT" />
          ) : (
            <Select
              id="code"
              name="code"
              required
              defaultValue={defaults?.code ?? ''}
              onChange={(e) => {
                if (e.target.value === '__autre__') setCustom(true);
              }}
            >
              <option value="">— Choisir —</option>
              {FEATURES.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.label}
                </option>
              ))}
              <option value="__autre__">Autre (code libre)…</option>
            </Select>
          )}
        </Field>
        <Field label="Nom commercial" htmlFor="name" required errors={err.name}>
          <Input id="name" name="name" required defaultValue={defaults?.name} placeholder="Présences et absences" />
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <Input id="description" name="description" maxLength={200} defaultValue={defaults?.description} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Prix" htmlFor="priceAmount" required errors={err.priceAmount}>
          <Input id="priceAmount" name="priceAmount" type="number" min="0" required defaultValue={defaults?.priceAmount ?? 0} />
        </Field>
        <Field label="Monnaie" htmlFor="currency">
          <Input id="currency" name="currency" maxLength={3} defaultValue={defaults?.currency ?? 'XOF'} />
        </Field>
        <Field label="Période" htmlFor="billingPeriod">
          <Select id="billingPeriod" name="billingPeriod" defaultValue={defaults?.billingPeriod ?? 'YEARLY'}>
            <option value="MONTHLY">Par mois</option>
            <option value="QUARTERLY">Par trimestre</option>
            <option value="YEARLY">Par an</option>
            <option value="ONE_TIME">Une seule fois</option>
          </Select>
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={defaults?.isActive ?? true} className="size-4" />
        Proposé à la vente
      </label>

      <SubmitButton size="sm">{submitLabel}</SubmitButton>
    </form>
  );
}
