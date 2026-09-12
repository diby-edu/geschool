import type { Metadata } from 'next';
import { listPlans } from '@/features/billing/platform';
import { savePlanAction, deletePlanAction } from '@/features/billing/actions';
import { PlanForm } from '@/features/billing/components/PlanForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Plans' };
export const dynamic = 'force-dynamic';

const PERIOD_LABEL: Record<string, string> = { MONTHLY: 'mois', QUARTERLY: 'trimestre', YEARLY: 'an', ONE_TIME: 'unique' };

export default async function PlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const plans = await listPlans();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.saved === '1' ? <Alert tone="success">Plan enregistré.</Alert> : null}
      {sp.deleted === '1' ? <Alert tone="info">Plan supprimé.</Alert> : null}

      <PageHeader title="Plans tarifaires" description="Offres et quotas de la plateforme" />

      {plans.length === 0 ? (
        <EmptyState title="Aucun plan" hint="Créez un premier plan ci-dessous." />
      ) : (
        <ul className="space-y-2">
          {plans.map((p) => (
            <li key={p.id}>
              <Card>
                <CardContent className="space-y-2 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{p.name}</span>{' '}
                      <span className="text-xs text-[color:var(--muted-foreground)]">
                        {p.code} · {p.price_amount.toLocaleString('fr-FR')} {p.currency}/{PERIOD_LABEL[p.billing_period] ?? p.billing_period}
                        {p.is_public ? '' : ' · privé'}{p.is_active ? '' : ' · inactif'}
                      </span>
                      <div className="text-xs text-[color:var(--muted-foreground)]">
                        Quotas — élèves {p.limits.students || '∞'} · comptes {p.limits.users || '∞'} · stockage {p.limits.storageMb || '∞'} Mo · SMS {p.limits.sms || '∞'}
                      </div>
                    </div>
                    <ConfirmSubmit action={deletePlanAction.bind(null, p.id)} label="Supprimer" variant="secondary" confirmMessage={`Supprimer le plan « ${p.name} » ?`} />
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm text-[color:var(--color-brand)]">Modifier</summary>
                    <div className="mt-3"><PlanForm action={savePlanAction.bind(null, p.id)} defaults={p} submitLabel="Enregistrer" /></div>
                  </details>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-medium">Nouveau plan</h2>
          <PlanForm action={savePlanAction.bind(null, null)} submitLabel="Créer le plan" />
        </CardContent>
      </Card>
    </div>
  );
}
