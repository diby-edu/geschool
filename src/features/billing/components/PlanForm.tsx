'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { BILLING_PERIODS } from '@/features/billing/schemas';
import type { PlanRow } from '@/features/billing/types';
import type { FormState } from '@/lib/forms';

const PERIOD_LABEL: Record<string, string> = { MONTHLY: 'Mensuel', QUARTERLY: 'Trimestriel', YEARLY: 'Annuel', ONE_TIME: 'Unique' };

export function PlanForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: PlanRow;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const lim = defaults?.limits ?? {};
  const g = (k: string, d: string | number = '') => (v[k] !== undefined ? v[k] : String(d));

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" htmlFor="code" required errors={err.code}>
          <Input id="code" name="code" defaultValue={v.code ?? defaults?.code ?? ''} required maxLength={40} />
        </Field>
        <Field label="Nom" htmlFor="name" required errors={err.name}>
          <Input id="name" name="name" defaultValue={v.name ?? defaults?.name ?? ''} required maxLength={120} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Prix" htmlFor="priceAmount" required errors={err.priceAmount}>
          <Input id="priceAmount" name="priceAmount" type="number" min="0" step="1" defaultValue={g('priceAmount', defaults?.price_amount ?? 0)} required />
        </Field>
        <Field label="Devise" htmlFor="currency" errors={err.currency}>
          <Input id="currency" name="currency" defaultValue={v.currency ?? defaults?.currency ?? 'XOF'} maxLength={3} />
        </Field>
        <Field label="Périodicité" htmlFor="billingPeriod" errors={err.billingPeriod}>
          <Select id="billingPeriod" name="billingPeriod" defaultValue={v.billingPeriod ?? defaults?.billing_period ?? 'YEARLY'}>
            {BILLING_PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p] ?? p}</option>)}
          </Select>
        </Field>
      </div>
      <fieldset className="rounded-[--radius-card] border p-3">
        <legend className="px-1 text-xs text-[color:var(--muted-foreground)]">Quotas (0 = illimité)</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Élèves" htmlFor="limitStudents"><Input id="limitStudents" name="limitStudents" type="number" min="0" defaultValue={g('limitStudents', lim.students ?? 0)} /></Field>
          <Field label="Comptes" htmlFor="limitUsers"><Input id="limitUsers" name="limitUsers" type="number" min="0" defaultValue={g('limitUsers', lim.users ?? 0)} /></Field>
          <Field label="Stockage (Mo)" htmlFor="limitStorageMb"><Input id="limitStorageMb" name="limitStorageMb" type="number" min="0" defaultValue={g('limitStorageMb', lim.storageMb ?? 0)} /></Field>
          <Field label="SMS" htmlFor="limitSms"><Input id="limitSms" name="limitSms" type="number" min="0" defaultValue={g('limitSms', lim.sms ?? 0)} /></Field>
        </div>
      </fieldset>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPublic" defaultChecked={defaults ? defaults.is_public : true} className="size-4" /> Public</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={defaults ? defaults.is_active : true} className="size-4" /> Actif</label>
      </div>
      <SubmitButton variant="secondary" size="sm">{submitLabel}</SubmitButton>
    </form>
  );
}
