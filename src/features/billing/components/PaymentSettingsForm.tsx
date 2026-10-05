'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import type { PaymentSettings } from '@/features/billing/payment-settings';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Comment les ecoles paient leur abonnement.
 *
 * Tant que `provider` est vide, l'ecran de paiement d'une ecole annonce
 * franchement que le paiement en ligne n'est pas ouvert et lui donne le
 * numero de versement. Le laisser vide n'est donc pas un oubli : c'est l'etat
 * normal avant d'avoir un compte marchand.
 */
export function PaymentSettingsForm({ action, settings }: { action: Action; settings: PaymentSettings }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [provider, setProvider] = useState(settings.provider);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="provider">
          Passerelle de paiement en ligne
        </label>
        <input
          id="provider"
          name="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          maxLength={40}
          placeholder="CinetPay, PayDunya, Wave…"
          className="w-56 rounded-xl border px-2 py-1.5 text-sm"
        />
        <p className="text-xs text-[color:var(--muted-foreground)]">
          {provider.trim() ? (
            <>
              Les écoles verront « paiement en ligne ouvert ». <strong>Ne renseignez ce nom que lorsque la
              passerelle répond vraiment</strong> — sinon elles cliqueront sur un bouton qui ne prélève rien.
            </>
          ) : (
            <>
              <strong>Vide</strong>&nbsp;: les écoles paient hors ligne, par versement sur le numéro ci-dessous. C’est
              l’état normal tant que vous n’avez pas de compte marchand.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="mm">
            Numéro Mobile Money
          </label>
          <input
            id="mm"
            name="mobileMoneyNumber"
            defaultValue={settings.mobileMoneyNumber}
            maxLength={40}
            placeholder="+225 07 00 00 00 00"
            className="w-full rounded-xl border px-2 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="mmname">
            Au nom de
          </label>
          <input
            id="mmname"
            name="mobileMoneyName"
            defaultValue={settings.mobileMoneyName}
            maxLength={80}
            className="w-full rounded-xl border px-2 py-1.5 text-sm"
          />
          <p className="text-xs text-[color:var(--muted-foreground)]">
            L’école le vérifie sur son téléphone avant de valider.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="instr">
          Précisions
        </label>
        <textarea
          id="instr"
          name="instructions"
          defaultValue={settings.instructions}
          maxLength={600}
          rows={3}
          className="w-full rounded-xl border px-2 py-1.5 text-sm"
          placeholder="Délai de confirmation, personne à joindre…"
        />
      </div>

      <SubmitButton>Enregistrer</SubmitButton>
    </form>
  );
}
