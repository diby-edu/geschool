'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import {
  ALERT_RECIPIENTS,
  RECIPIENT_LABELS,
  type AlertRecipient,
  type AttendancePolicy,
} from '@/features/attendance/policy-types';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Quand prévenir, et qui.
 *
 * Deux seuils en heures cumulées sur la période. Le SMS reste décoché : à ce
 * prix-là, une vague d'alertes vers quatre cents familles se chiffre, et on ne
 * coche pas cela par distraction.
 */
export function PolicyForm({
  action,
  policy,
  pricePerSms,
}: {
  action: Action;
  policy: AttendancePolicy;
  pricePerSms: number;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [alerte, setAlerte] = useState(String(policy.alertAfterHours));
  const [sms, setSms] = useState(policy.alertBySms);
  const [destinataires, setDestinataires] = useState<AlertRecipient[]>(policy.alertRecipients);

  const bascule = (r: AlertRecipient) =>
    setDestinataires((d) => (d.includes(r) ? d.filter((x) => x !== r) : [...d, r]));

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <section className="space-y-2">
        <div>
          <p className="text-sm font-semibold">Alerter au bout de</p>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Heures d’absence cumulées sur la période. Zéro&nbsp;: aucune alerte.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            name="alertAfterHours"
            value={alerte}
            onChange={(e) => setAlerte(e.target.value)}
            inputMode="numeric"
            className="w-20 rounded-xl border px-2 py-1.5 text-sm"
          />
          <span className="text-sm">heures</span>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold">Qui reçoit l’alerte</p>
        <div className="space-y-2">
          {ALERT_RECIPIENTS.map((r) => (
            <label
              key={r}
              className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              <input
                type="checkbox"
                name="alertRecipients"
                value={r}
                checked={destinataires.includes(r)}
                onChange={() => bascule(r)}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="font-semibold">{RECIPIENT_LABELS[r].title}</span>
                <br />
                <span className="text-xs text-[color:var(--muted-foreground)]">{RECIPIENT_LABELS[r].hint}</span>
              </span>
            </label>
          ))}
        </div>

        <label
          className="flex cursor-pointer gap-2 rounded-2xl border p-3 text-sm"
          style={{ backgroundColor: 'var(--surface)', borderColor: sms ? 'var(--color-warning)' : undefined }}
        >
          <input
            type="checkbox"
            name="alertBySms"
            checked={sms}
            onChange={(e) => setSms(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="font-semibold">Envoyer aussi un SMS au parent</span>
            <br />
            <span className="text-xs text-[color:var(--muted-foreground)]">
              {pricePerSms > 0
                ? `${pricePerSms} par message. Une vague vers 400 familles coûte ${(pricePerSms * 400).toLocaleString('fr-FR')}.`
                : 'Chaque message est facturé.'}{' '}
              Le tableau de bord, lui, ne coûte rien.
            </span>
          </span>
        </label>
      </section>

      <section className="space-y-2">
        <div>
          <p className="text-sm font-semibold">Convoquer la famille au bout de</p>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Heures d’absence <strong>non justifiées</strong>. Zéro&nbsp;: aucune convocation automatique.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            name="summonAfterUnjustifiedHours"
            defaultValue={String(policy.summonAfterUnjustifiedHours)}
            inputMode="numeric"
            className="w-20 rounded-xl border px-2 py-1.5 text-sm"
          />
          <span className="text-sm">heures</span>
        </div>
      </section>

      <SubmitButton>Enregistrer les règles</SubmitButton>
    </form>
  );
}
