'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { SUBSCRIPTION_STATUSES } from '@/features/billing/schemas';
import type { FormState } from '@/lib/forms';

const STATUS_LABEL: Record<string, string> = {
  TRIALING: 'Essai', ACTIVE: 'Actif', PAST_DUE: 'Impayé', SUSPENDED: 'Suspendu', CANCELLED: 'Annulé',
};

export function SubscriptionForm({
  action,
  plans,
  defaults,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  plans: { id: string; name: string }[];
  defaults?: { planId?: string; status?: string; trialEndsAt?: string | null; periodStart?: string | null; periodEnd?: string | null };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};
  const d = defaults ?? {};

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan" htmlFor="planId" required errors={err.planId}>
          <Select id="planId" name="planId" defaultValue={d.planId ?? ''} required>
            <option value="">—</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Statut" htmlFor="status" errors={err.status}>
          <Select id="status" name="status" defaultValue={d.status ?? 'ACTIVE'}>
            {SUBSCRIPTION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fin d’essai" htmlFor="trialEndsAt"><Input id="trialEndsAt" name="trialEndsAt" type="date" defaultValue={d.trialEndsAt?.slice(0, 10) ?? ''} /></Field>
        <Field label="Début période" htmlFor="periodStart"><Input id="periodStart" name="periodStart" type="date" defaultValue={d.periodStart?.slice(0, 10) ?? ''} /></Field>
        <Field label="Fin période" htmlFor="periodEnd"><Input id="periodEnd" name="periodEnd" type="date" defaultValue={d.periodEnd?.slice(0, 10) ?? ''} /></Field>
      </div>
      <SubmitButton size="sm">Enregistrer l’abonnement</SubmitButton>
    </form>
  );
}
