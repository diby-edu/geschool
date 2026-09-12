import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getMySubscription, computeUsage, listMyPayments } from '@/features/billing/school';
import { recordPaymentAction } from '@/features/billing/actions';
import { PaymentForm } from '@/features/billing/components/PaymentForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Facturation' };

const SUB_STATUS: Record<string, string> = {
  TRIALING: 'Essai', ACTIVE: 'Actif', PAST_DUE: 'Impayé', SUSPENDED: 'Suspendu', CANCELLED: 'Annulé',
};
const PAY_STATUS: Record<string, string> = {
  PENDING: 'En attente', PAID: 'Payé', FAILED: 'Échoué', REFUNDED: 'Remboursé', CANCELLED: 'Annulé',
};

export default async function FacturationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'billing.view');

  const [sub, usage, payments] = await Promise.all([getMySubscription(ctx), computeUsage(ctx), listMyPayments(ctx)]);
  const canManage = hasPermission(ctx, 'billing.manage');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.paid === '1' ? <Alert tone="success">Paiement enregistré.</Alert> : null}
      <PageHeader title="Facturation" description={ctx.school.name} />

      <Card>
        <CardContent className="space-y-1 py-4 text-sm">
          <h2 className="text-sm font-medium">Abonnement</h2>
          {sub ? (
            <>
              <p className="text-lg font-semibold">{sub.plans?.name ?? '—'}</p>
              <p className="text-[color:var(--muted-foreground)]">
                Statut : {SUB_STATUS[sub.status] ?? sub.status}
                {sub.plans ? ` · ${Number(sub.plans.price_amount).toLocaleString('fr-FR')} ${sub.plans.currency}` : ''}
                {sub.current_period_end ? ` · échéance ${sub.current_period_end.slice(0, 10)}` : ''}
              </p>
            </>
          ) : (
            <p className="text-[color:var(--muted-foreground)]">Aucun abonnement actif. Contactez la plateforme.</p>
          )}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Consommation</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {usage.map((u) => {
            const over = u.limit > 0 && u.used > u.limit;
            return (
              <Card key={u.metric}>
                <CardContent className="py-3">
                  <div className="text-sm text-[color:var(--muted-foreground)]">{u.label}</div>
                  <div className={`text-xl font-bold ${over ? 'text-[color:var(--color-danger)]' : ''}`}>
                    {u.used}{u.limit > 0 ? ` / ${u.limit}` : ' / ∞'}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Paiements</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Aucun paiement enregistré.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between rounded-[--radius-card] border px-3 py-2">
                <span>{new Date(p.created_at).toLocaleDateString('fr-FR')} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
                <span className="font-medium">{p.amount.toLocaleString('fr-FR')} {p.currency} · {PAY_STATUS[p.status] ?? p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage ? (
        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-medium">Enregistrer un paiement</h2>
            <p className="mb-3 text-xs text-[color:var(--muted-foreground)]">
              Consigne un paiement déjà reçu (mobile money, espèces, virement). Aucun prélèvement n’est effectué.
            </p>
            <PaymentForm action={recordPaymentAction.bind(null, slug)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
