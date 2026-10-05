import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { computeUsage } from '@/features/billing/school';
import { readBilling } from '@/features/billing/subscription';
import { SubscriptionView } from '@/features/billing/components/SubscriptionView';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Mon abonnement' };
export const dynamic = 'force-dynamic';

/**
 * Mon abonnement.
 *
 * L'ecran precedent parlait de « plan », de « statut » et proposait de
 * DECLARER un paiement deja fait — c'est-a-dire de prevenir l'editeur qu'on
 * lui avait envoye de l'argent, et d'attendre qu'il le confirme. Un directeur
 * attend l'inverse : voir ce qu'il a, jusqu'a quand, et payer.
 */
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

  const [billing, usage] = await Promise.all([readBilling(ctx), computeUsage(ctx)]);
  const canManage = hasPermission(ctx, 'billing.manage');

  const echus = billing.modules.filter((m) => m.expired);
  const bientot = billing.modules.filter((m) => !m.expired && m.daysLeft !== null && m.daysLeft <= 30);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.paye === '1' ? <Alert tone="success">Paiement enregistré. Votre reçu est disponible ci-dessous.</Alert> : null}

      <PageHeader title="Mon abonnement" description={ctx.school.name} action={<BackToSettings ctx={ctx} />} />

      {echus.length > 0 ? (
        <Alert tone="error">
          {echus.length === 1
            ? `Le module « ${echus[0]!.name} » est échu : ses écrans se ferment.`
            : `${echus.length} modules sont échus : leurs écrans se ferment.`}{' '}
          Renouvelez pour les rouvrir.
        </Alert>
      ) : bientot.length > 0 ? (
        <Alert tone="warning">
          {bientot.length === 1
            ? `« ${bientot[0]!.name} » arrive à échéance dans ${bientot[0]!.daysLeft} jour(s).`
            : `${bientot.length} modules arrivent à échéance dans le mois.`}
        </Alert>
      ) : null}

      <SubscriptionView data={billing} slug={slug} canManage={canManage} />

      {usage.length > 0 ? (
        <Card>
          <CardContent className="space-y-3">
            <h2 className="text-sm font-semibold">Ce que vous utilisez</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {usage.map((u) => {
                const over = u.limit > 0 && u.used > u.limit;
                return (
                  <div key={u.metric} className="rounded-[--radius-card] border px-3 py-2">
                    <div className="text-sm text-[color:var(--muted-foreground)]">{u.label}</div>
                    <div className={`text-xl font-bold tabular-nums ${over ? 'text-[color:var(--color-danger)]' : ''}`}>
                      {u.used}
                      {u.limit > 0 ? ` / ${u.limit}` : ' / ∞'}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
