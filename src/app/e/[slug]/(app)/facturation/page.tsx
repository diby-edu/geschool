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
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Facturation' };

const SUB_STATUS: Record<string, string> = {
  TRIALING: 'Essai', ACTIVE: 'Actif', PAST_DUE: 'Impayé', SUSPENDED: 'Suspendu', CANCELLED: 'Annulé',
};
const PAY_STATUS: Record<string, string> = {
  PENDING: 'Déclaré, à confirmer', PAID: 'Confirmé', FAILED: 'Échoué', REFUNDED: 'Remboursé', CANCELLED: 'Refusé',
};
const PAY_METHOD: Record<string, string> = {
  MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CASH: 'Espèces', CARD: 'Carte', OTHER: 'Autre',
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
      {sp.paid === '1' ? (
        <Alert tone="success">
          {ctx.isPlatformAdmin ? 'Paiement enregistré.' : 'Paiement déclaré : il apparaîtra comme confirmé dès que la plateforme l’aura vérifié.'}
        </Alert>
      ) : null}
      <PageHeader title="Facturation" description={ctx.school.name} action={<BackToSettings ctx={ctx} />}
      />

      <Card>
        <CardContent className="space-y-1 py-4 text-sm">
          <h2 className="text-sm font-medium">Abonnement</h2>
          {sub ? (
            <>
              {sub.plan_id ? (
                <>
                  <p className="text-lg font-semibold">{sub.plans?.name ?? '—'}</p>
                  <p className="text-[color:var(--muted-foreground)]">
                    Statut : {SUB_STATUS[sub.status] ?? sub.status}
                    {sub.plans ? ` · ${Number(sub.plans.price_amount).toLocaleString('fr-FR')} ${sub.plans.currency}` : ''}
                    {sub.current_period_end ? ` · échéance ${sub.current_period_end.slice(0, 10)}` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[color:var(--muted-foreground)]">
                    Statut : {SUB_STATUS[sub.status] ?? sub.status}
                    {sub.trial_ends_at ? ` · essai jusqu'au ${sub.trial_ends_at.slice(0, 10)}` : ''}
                  </p>
                  {sub.subscription_modules.length === 0 ? (
                    <p className="text-[color:var(--muted-foreground)]">Aucun module actif.</p>
                  ) : (
                    <ul className="space-y-1">
                      {sub.subscription_modules.map((sm, i) =>
                        sm.modules ? (
                          <li key={i} className="flex justify-between">
                            <span>{sm.modules.name}</span>
                            <span className="font-medium">
                              {Number(sm.modules.price_amount).toLocaleString('fr-FR')} {sm.modules.currency} / an
                            </span>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  )}
                </>
              )}
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
                <span>{new Date(p.created_at).toLocaleDateString('fr-FR')} · {PAY_METHOD[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
                <span className="font-medium">{p.amount.toLocaleString('fr-FR')} {p.currency} · {PAY_STATUS[p.status] ?? p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage ? (
        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-medium">{ctx.isPlatformAdmin ? 'Enregistrer un paiement' : 'Déclarer un paiement'}</h2>
            <p className="mb-3 text-xs text-[color:var(--muted-foreground)]">
              {ctx.isPlatformAdmin
                ? 'Consigne un paiement déjà reçu (mobile money, espèces, virement). Aucun prélèvement n’est effectué.'
                : 'Signalez un paiement déjà effectué (mobile money, virement, espèces) avec sa référence : la plateforme le vérifie puis le confirme. Aucun prélèvement n’est effectué.'}
            </p>
            <PaymentForm action={recordPaymentAction.bind(null, slug)} canSetStatus={ctx.isPlatformAdmin} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
