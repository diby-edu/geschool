'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { SENDER_MAX, SENDER_MIN, senderProblem } from '@/features/sms/sender-types';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Le nom qui s'affichera sur le téléphone des familles.
 *
 * Trois à onze caractères, règle de l'opérateur : on le compte à la frappe
 * plutôt que de laisser découvrir le refus dix jours plus tard.
 */
export function SenderForm({
  action,
  name,
  usePlatform,
  platformSender,
  approved,
}: {
  action: Action;
  name: string;
  usePlatform: boolean;
  platformSender: string;
  approved: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [valeur, setValeur] = useState(name);
  const [plateforme, setPlateforme] = useState(usePlatform);

  const probleme = valeur.trim() ? senderProblem(valeur) : null;
  const apercu = plateforme || !approved ? platformSender : valeur.trim() || platformSender;

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="sender-name">
          Nom d’expéditeur souhaité
        </label>
        <div className="flex items-center gap-2">
          <input
            id="sender-name"
            name="name"
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            maxLength={SENDER_MAX}
            className="w-48 rounded-xl border px-2 py-1.5 text-sm"
            placeholder="LYCEE YOP"
          />
          <span className={`text-xs ${probleme ? 'text-[color:var(--color-danger)]' : 'text-[color:var(--muted-foreground)]'}`}>
            {valeur.trim().length}/{SENDER_MAX}
          </span>
        </div>
        <p className="text-xs text-[color:var(--muted-foreground)]">
          De {SENDER_MIN} à {SENDER_MAX} caractères, espaces compris. Lettres sans accent, chiffres et espaces
          seulement.
        </p>
        {probleme ? <p className="text-xs text-[color:var(--color-danger)]">{probleme}</p> : null}
      </div>

      <label className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm" style={{ backgroundColor: 'var(--surface)' }}>
        <input
          type="checkbox"
          name="usePlatform"
          checked={plateforme}
          onChange={(e) => setPlateforme(e.target.checked)}
          className="mt-0.5 size-4"
        />
        <span>
          <span className="font-semibold">Rester sous le nom de la plateforme</span>
          <br />
          <span className="text-xs text-[color:var(--muted-foreground)]">
            Même une fois le vôtre approuvé. Utile si vous préférez ne pas afficher le nom de l’établissement.
          </span>
        </span>
      </label>

      <p className="rounded-xl border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--surface)' }}>
        Les SMS partiront sous&nbsp;: <strong>{apercu}</strong>
        {apercu === platformSender && valeur.trim() && !plateforme ? (
          <span className="text-[color:var(--muted-foreground)]"> — tant que « {valeur.trim()} » n’est pas approuvé.</span>
        ) : null}
      </p>

      <SubmitButton>Enregistrer</SubmitButton>
    </form>
  );
}
