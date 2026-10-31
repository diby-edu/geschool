import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { logout } from '@/features/auth/actions';
import type { PaymentSettings } from '../payment-settings';
import { createRequestAction } from '@/features/support/actions';
import { TextForm } from '@/features/support/components/TextForm';
import type { RequestThread } from '@/features/support/requests';
import type { FormState } from '@/lib/forms';
import { OnlinePayButton } from './OnlinePayButton';

/**
 * Abonnement expiré (0143), décidé le 2026-10-25 :
 * - pendant le délai de grâce, un message à la DIRECTION seulement ;
 * - après, une page « abonnement expiré » pour TOUT le monde (direction,
 *   personnel, enseignants, parents) ; la direction y voit comment payer.
 * Aucune donnée n'est touchée : tout revient dès que le paiement est confirmé.
 */

const jour = (iso: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

export function BillingGraceBanner({ slug, endsOn, graceEndsOn }: { slug: string; endsOn: string | null; graceEndsOn: string | null }) {
  return (
    <div className="mb-4">
      <Alert tone="warning">
        <b>L’abonnement de l’école a expiré{endsOn ? ` le ${jour(endsOn)}` : ''}.</b>{' '}
        {graceEndsOn ? `Sans paiement, l’accès sera coupé le ${jour(graceEndsOn)} pour tout le monde (personnel, enseignants et parents).` : 'Pensez à régler l’abonnement.'}{' '}
        <Link href={`/e/${slug}/facturation`} className="font-semibold underline">
          Voir l’abonnement et payer
        </Link>
      </Alert>
    </div>
  );
}

export function BillingBlockedPage({
  schoolName,
  endsOn,
  isDirection,
  payment,
  contact,
  support,
  online,
}: {
  schoolName: string;
  endsOn: string | null;
  isDirection: boolean;
  payment: PaymentSettings | null;
  /**
   * « Contacter la plateforme » (lot 5) reste ouvert pendant la coupure : on
   * doit pouvoir dire « j'ai payé ». Le formulaire et les dernières réponses
   * sont ici, puisque le reste de l'espace est fermé.
   */
  contact?: { slug: string; threads: RequestThread[] } | null;
  /** Coordonnées du support (Réglages de la plateforme, lot 6). */
  support?: { phone: string; email: string } | null;
  /** Paiement en ligne de tout l'abonnement (PayDunya, 0157) : l'école se débloque seule. */
  online?: { action: (p: FormState, fd: FormData) => Promise<FormState>; amount: number; fee: number; feePct: number } | null;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-5 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">{schoolName}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Abonnement expiré</h1>
        <p className="mt-2 text-[color:var(--muted-foreground)]">
          L’abonnement de l’école {endsOn ? `a pris fin le ${jour(endsOn)}` : 'a pris fin'} et le délai de grâce est passé. L’accès est suspendu pour tout le
          monde jusqu’au paiement. Aucune donnée n’est perdue : tout revient dès que le paiement est confirmé.
        </p>
      </div>

      {isDirection ? (
        <div className="space-y-3 rounded-2xl border p-5" style={{ backgroundColor: 'var(--surface)' }}>
          <h2 className="font-bold">Comment payer</h2>
          {online ? (
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-brand)' }}>
              <p className="mb-2 text-sm font-semibold">Payer en ligne — l’accès revient dès que le paiement est confirmé</p>
              <OnlinePayButton action={online.action} amount={online.amount} fee={online.fee} feePct={online.feePct} />
            </div>
          ) : null}
          {payment && (payment.mobileMoneyNumber || payment.instructions) ? (
            <div className="space-y-1.5 text-sm">
              {payment.mobileMoneyNumber ? (
                <p>
                  Mobile Money : <b className="font-mono">{payment.mobileMoneyNumber}</b>
                  {payment.mobileMoneyName ? ` (${payment.mobileMoneyName})` : ''}
                </p>
              ) : null}
              {payment.instructions ? <p className="whitespace-pre-line">{payment.instructions}</p> : null}
            </div>
          ) : (
            <p className="text-sm">
              Contactez la plateforme pour régler l’abonnement de l’année
              {support?.phone ? ` : ${support.phone}` : ''}
              {support?.email ? ` · ${support.email}` : ''}.
            </p>
          )}
          <p className="text-sm text-[color:var(--muted-foreground)]">Dès que la plateforme confirme le paiement, l’accès revient pour tout le monde.</p>
        </div>
      ) : (
        <Alert tone="info">Pour toute question, adressez-vous à la direction de l’école.</Alert>
      )}

      {contact ? (
        <div className="space-y-3 rounded-2xl border p-5" style={{ backgroundColor: 'var(--surface)' }}>
          <h2 className="font-bold">Écrire à la plateforme</h2>
          {contact.threads.map((t) => {
            const reply = [...t.messages].reverse().find((m) => m.fromPlatform);
            return (
              <div key={t.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
                <b>{t.subject}</b>
                <p className="mt-1 whitespace-pre-line text-[color:var(--muted-foreground)]">
                  {reply ? `Réponse de la plateforme : ${reply.body}` : 'En attente de réponse de la plateforme.'}
                </p>
              </div>
            );
          })}
          <TextForm action={createRequestAction.bind(null, contact.slug)} withSubject label="Votre message" submit="Envoyer à la plateforme" />
        </div>
      ) : null}

      <form action={logout}>
        <Button type="submit" variant="secondary">
          Se déconnecter
        </Button>
      </form>
    </main>
  );
}
