import type { Metadata } from 'next';
import { listPlans } from '@/features/billing/platform';
import { listModules } from '@/features/billing/modules';
import { savePlanAction, deletePlanAction, saveModuleAction, deleteModuleAction } from '@/features/billing/actions';
import { PlanForm } from '@/features/billing/components/PlanForm';
import { ModuleForm } from '@/features/billing/components/ModuleForm';
import { FEATURE_LABELS } from '@/lib/modules/features';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Plans et modules' };
export const dynamic = 'force-dynamic';

const PERIOD_LABEL: Record<string, string> = { MONTHLY: 'mois', QUARTERLY: 'trimestre', YEARLY: 'an', ONE_TIME: 'unique' };

export default async function PlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [plans, modules] = await Promise.all([listPlans(), listModules()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.saved === '1' ? <Alert tone="success">Plan enregistré.</Alert> : null}
      {sp.deleted === '1' ? <Alert tone="info">Plan supprimé.</Alert> : null}
      {sp.module === '1' ? <Alert tone="success">Module enregistré.</Alert> : null}
      {sp.module_supprime === '1' ? <Alert tone="info">Module supprimé.</Alert> : null}

      <PageHeader
        title="Plans et modules"
        description="Les formules vendues aux établissements, et les modules qui les composent."
      />

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

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Modules vendables
        </h2>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Le code d’un module est celui qui décide aussi de ce qu’une école voit : vendre « Présences » et couper
          « Présences » parlent du même module.
        </p>

        {modules.length === 0 ? (
          <EmptyState title="Aucun module" hint="Ajoutez ceux que vous vendez à part du forfait." />
        ) : (
          <ul className="space-y-2">
            {modules.map((m) => (
              <li key={m.id}>
                <Card>
                  <CardContent className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-medium">{m.name}</span>{' '}
                        <span className="text-xs text-[color:var(--muted-foreground)]">
                          {m.code}
                          {FEATURE_LABELS[m.code] ? ` · ${FEATURE_LABELS[m.code]}` : ' · code libre'} ·{' '}
                          {m.priceAmount.toLocaleString('fr-FR')} {m.currency}/
                          {PERIOD_LABEL[m.billingPeriod] ?? m.billingPeriod}
                          {m.isActive ? '' : ' · retiré de la vente'}
                        </span>
                        {m.description ? (
                          <div className="text-xs text-[color:var(--muted-foreground)]">{m.description}</div>
                        ) : null}
                      </div>
                      <ConfirmSubmit
                        action={deleteModuleAction.bind(null, m.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer le module « ${m.name} » du catalogue ?`}
                      />
                    </div>
                    <details>
                      <summary className="cursor-pointer text-sm text-[color:var(--color-brand)]">Modifier</summary>
                      <div className="mt-3">
                        <ModuleForm action={saveModuleAction.bind(null, m.id)} defaults={m} submitLabel="Enregistrer" />
                      </div>
                    </details>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <Card>
          <CardContent>
            <h3 className="mb-3 text-sm font-medium">Nouveau module</h3>
            <ModuleForm action={saveModuleAction.bind(null, null)} submitLabel="Ajouter le module" />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-medium">Nouveau plan</h2>
          <PlanForm action={savePlanAction.bind(null, null)} submitLabel="Créer le plan" />
        </CardContent>
      </Card>
    </div>
  );
}
