'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/features/auth/components/SubmitButton';
import type { FormState } from '@/lib/forms';
import { CORRECTION_LABELS, CORRECTION_TONES, type CorrectionRow } from '@/features/evaluations/correction-types';

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Une demande de correction, et ce qu'on peut en faire.
 *
 * L'avant et l'après sont montrés côte à côte, en gros : c'est la seule chose
 * que l'enseignant doit vraiment lire avant de répondre.
 */
export function CorrectionCard({
  c,
  accept,
  refuse,
  override,
}: {
  c: CorrectionRow;
  accept?: Action;
  refuse?: Action;
  override?: Action;
}) {
  const [etatAccept, actionAccept] = useActionState<FormState, FormData>(accept ?? vide, {});
  const [etatRefus, actionRefus] = useActionState<FormState, FormData>(refuse ?? vide, {});
  const [etatForce, actionForce] = useActionState<FormState, FormData>(override ?? vide, {});
  const [ouvert, setOuvert] = useState<'refus' | 'force' | null>(null);

  const ton = CORRECTION_TONES[c.status];
  const erreur = etatAccept.error ?? etatRefus.error ?? etatForce.error;

  return (
    <article className="rounded-2xl border p-3" style={{ backgroundColor: 'var(--surface)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm">
          <strong>{c.student}</strong>
          <span className="text-[color:var(--muted-foreground)]">
            {' '}
            · {c.klass} · {c.subject}
          </span>
          <br />
          <span className="text-xs text-[color:var(--muted-foreground)]">
            {c.assessment} — enseignant : {c.teacher}
          </span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: `var(--color-${ton}-soft, var(--muted))`, color: `var(--color-${ton})` }}
        >
          {CORRECTION_LABELS[c.status]}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-sm">
        <span className="rounded-xl border px-3 py-1">
          <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted-foreground)]">Note actuelle</span>
          <br />
          <strong className="text-lg">{c.before}</strong>
        </span>
        <span aria-hidden>→</span>
        <span className="rounded-xl border-2 px-3 py-1" style={{ borderColor: 'var(--color-primary)' }}>
          <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted-foreground)]">Note demandée</span>
          <br />
          <strong className="text-lg">{c.after}</strong>
        </span>
      </div>

      <p className="mt-2 text-sm">
        <span className="text-[color:var(--muted-foreground)]">Motif : </span>
        {c.reason}
      </p>
      {c.decisionReason ? (
        <p className="mt-1 text-sm">
          <span className="text-[color:var(--muted-foreground)]">Réponse : </span>
          {c.decisionReason}
        </p>
      ) : null}

      {erreur ? (
        <div className="mt-2">
          <Alert tone="error">{erreur}</Alert>
        </div>
      ) : null}

      {c.status === 'PENDING' && !c.teacherHasAccount ? (
        <div className="mt-2">
          <Alert tone="info">
            Cet enseignant n’a pas encore de compte : il ne peut pas répondre. La demande restera en attente tant que
            la direction ne tranchera pas, ou qu’un accès ne lui sera pas transmis.
          </Alert>
        </div>
      ) : null}

      {c.status === 'PENDING' && (accept || override) ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {accept ? (
              <form action={actionAccept}>
                <SubmitButton>Accepter la correction</SubmitButton>
              </form>
            ) : null}
            {refuse ? (
              <button
                type="button"
                onClick={() => setOuvert(ouvert === 'refus' ? null : 'refus')}
                className="rounded-xl border px-3 py-1.5 text-sm"
              >
                Refuser
              </button>
            ) : null}
            {override ? (
              <button
                type="button"
                onClick={() => setOuvert(ouvert === 'force' ? null : 'force')}
                className="rounded-xl border px-3 py-1.5 text-sm"
                style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
              >
                Appliquer sans son accord
              </button>
            ) : null}
          </div>

          {ouvert === 'refus' && refuse ? (
            <form action={actionRefus} className="space-y-2">
              <label className="block text-xs font-medium" htmlFor={`refus-${c.id}`}>
                Pourquoi refusez-vous ? Ce motif restera au journal, à côté de la demande.
              </label>
              <textarea
                id={`refus-${c.id}`}
                name="decisionReason"
                rows={2}
                className="w-full rounded-xl border px-2 py-1.5 text-sm"
              />
              <SubmitButton>Confirmer le refus</SubmitButton>
            </form>
          ) : null}

          {ouvert === 'force' && override ? (
            <form action={actionForce} className="space-y-2">
              <Alert tone="error">
                La correction sera appliquée malgré l’enseignant. Il en sera informé, et le journal portera la mention
                « appliquée sans son accord » — définitivement.
              </Alert>
              <label className="block text-xs font-medium" htmlFor={`force-${c.id}`}>
                Motif de la décision
              </label>
              <textarea
                id={`force-${c.id}`}
                name="decisionReason"
                rows={2}
                className="w-full rounded-xl border px-2 py-1.5 text-sm"
              />
              <SubmitButton>Appliquer malgré tout</SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

const vide: Action = async () => ({});
