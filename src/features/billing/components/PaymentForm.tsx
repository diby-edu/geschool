'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@/features/billing/schemas';
import type { FormState } from '@/lib/forms';

const METHOD_LABEL: Record<string, string> = {
  MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CASH: 'Espèces', CARD: 'Carte', OTHER: 'Autre',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente', PAID: 'Payé', FAILED: 'Échoué', REFUNDED: 'Remboursé', CANCELLED: 'Annulé',
};

export function PaymentForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Montant" htmlFor="amount" required errors={err.amount}>
          <Input id="amount" name="amount" type="number" min="0" step="1" required />
        </Field>
        <Field label="Devise" htmlFor="currency"><Input id="currency" name="currency" defaultValue="XOF" maxLength={3} /></Field>
        <Field label="Moyen" htmlFor="method">
          <Select id="method" name="method" defaultValue="MOBILE_MONEY">
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m] ?? m}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Statut" htmlFor="status">
          <Select id="status" name="status" defaultValue="PAID">
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
          </Select>
        </Field>
        <Field label="Référence" htmlFor="reference"><Input id="reference" name="reference" maxLength={120} /></Field>
        <Field label="Note" htmlFor="notes"><Input id="notes" name="notes" maxLength={500} /></Field>
      </div>
      <SubmitButton variant="secondary" size="sm">Enregistrer le paiement</SubmitButton>
    </form>
  );
}
