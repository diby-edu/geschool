'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { SENDER_MAX, senderProblem } from '@/features/sms/sender-types';
import type { PlatformSms } from '@/features/sms/platform';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** Les réglages SMS de l'éditeur : prix, nom prêté, destinataire des dossiers. */
export function PlatformSmsForm({ action, settings }: { action: Action; settings: PlatformSms }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [prix, setPrix] = useState(String(settings.pricePerSms));
  const [sender, setSender] = useState(settings.fallbackSender);

  const probleme = senderProblem(sender);
  const parSms = Number(prix.replace(',', '.')) || 0;

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="price">
          Prix d’un SMS
        </label>
        <input
          id="price"
          name="pricePerSms"
          value={prix}
          onChange={(e) => setPrix(e.target.value)}
          inputMode="decimal"
          className="w-28 rounded-xl border px-2 py-1.5 text-sm"
        />
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Sert au compteur de coût avant un envoi groupé. {parSms > 0 ? `400 destinataires coûteraient ${(parSms * 400).toLocaleString('fr-FR')}.` : ''}
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="fallback">
          Nom d’expéditeur prêté aux établissements
        </label>
        <input
          id="fallback"
          name="fallbackSender"
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          maxLength={SENDER_MAX}
          className="w-48 rounded-xl border px-2 py-1.5 text-sm"
        />
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Celui qui est <strong>déjà approuvé</strong> chez l’opérateur. Les écoles l’empruntent tant que le leur est en
          validation.
        </p>
        {probleme ? <p className="text-xs text-[color:var(--color-danger)]">{probleme}</p> : null}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="email">
          Adresse qui reçoit les dossiers de validation
        </label>
        <input
          id="email"
          name="senderRequestEmail"
          defaultValue={settings.senderRequestEmail}
          type="email"
          className="w-full rounded-xl border px-2 py-1.5 text-sm"
          placeholder="vous@exemple.com"
        />
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Les dossiers vous arrivent ici&nbsp;; vous les transmettez ensuite à l’opérateur.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="confirm">
          Confirmer un envoi au-delà de
        </label>
        <input
          id="confirm"
          name="confirmAboveAmount"
          defaultValue={String(settings.confirmAboveAmount)}
          inputMode="decimal"
          className="w-32 rounded-xl border px-2 py-1.5 text-sm"
        />
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Au-dessus de ce montant, l’application demande une confirmation avant de lancer un envoi groupé.
        </p>
      </div>

      <SubmitButton>Enregistrer</SubmitButton>
    </form>
  );
}
