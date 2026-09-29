import type { Metadata } from 'next';
import Link from 'next/link';
import { listPayments } from '@/features/platform/admin';
import { settlePaymentAction } from '@/features/billing/actions';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Paiements' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Déclaré, à confirmer',
  PAID: 'Confirmé',
  CANCELLED: 'Refusé',
  REFUNDED: 'Remboursé',
  FAILED: 'Échoué',
};

const METHOD_LABEL: Record<string, string> = {
  MOBILE_MONEY: 'Mobile money',
  BANK_TRANSFER: 'Virement',
  CASH: 'Espèces',
  CARD: 'Carte',
  CHECK: 'Chèque',
  OTHER: 'Autre',
};

const money = (amount: number, currency: string) =>
  `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;

/**
 * Tous les paiements déclarés par les écoles, au même endroit.
 *
 * Une école déclare, la plateforme confirme (migration 0058) : sans cet écran,
 * il fallait ouvrir chaque établissement pour trouver ce qui attend.
 */
export default async function PlatformPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const all = sp.tout === '1';
  const payments = await listPayments(all ? 'ALL' : 'PENDING');
  const pending = payments.filter((p) => p.status === 'PENDING');

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Paiements"
        description={
          all
            ? `${payments.length} paiement(s) · ${pending.length} en attente de confirmation`
            : `${payments.length} paiement(s) déclaré(s), en attente de votre confirmation`
        }
        action={
          <Link href={all ? '/admin/paiements' : '/admin/paiements?tout=1'} className="text-sm hover:underline">
            {all ? 'Voir seulement les paiements en attente' : 'Voir tout l’historique'}
          </Link>
        }
      />

      {payments.length === 0 ? (
        <EmptyState
          title={all ? 'Aucun paiement' : 'Aucun paiement en attente'}
          hint="Les écoles déclarent leurs règlements depuis leur page Abonnement."
        />
      ) : (
        <ul className="space-y-2">
          {payments.map((p) => (
            <li key={p.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {money(p.amount, p.currency)} ·{' '}
                      <Link href={`/admin/etablissements/${p.schoolId}`} className="hover:underline">
                        {p.schoolName}
                      </Link>
                    </p>
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      {METHOD_LABEL[p.method] ?? p.method}
                      {p.reference ? ` · réf. ${p.reference}` : ''} ·{' '}
                      {new Date(p.createdAt).toLocaleDateString('fr-FR')} · {STATUS_LABEL[p.status] ?? p.status}
                    </p>
                  </div>
                  {p.status === 'PENDING' ? (
                    <div className="flex shrink-0 gap-2">
                      <ConfirmSubmit
                        action={settlePaymentAction.bind(null, p.schoolId, p.id, 'PAID')}
                        label="Confirmer"
                        variant="secondary"
                        confirmMessage={`Confirmer ce règlement de ${money(p.amount, p.currency)} pour « ${p.schoolName} » ?`}
                      />
                      <ConfirmSubmit
                        action={settlePaymentAction.bind(null, p.schoolId, p.id, 'CANCELLED')}
                        label="Refuser"
                        confirmMessage="Refuser ce paiement déclaré ? L’école devra le déclarer à nouveau."
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
