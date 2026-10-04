import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listPlans, getSchoolSubscription } from '@/features/billing/platform';
import { assignSubscriptionAction, settlePaymentAction } from '@/features/billing/actions';
import { grantSmsAction } from '@/features/sms/actions';
import { listGrants, readQuotaForSchool } from '@/features/sms/grants';
import { currentMonth, quotaLabel, WARN_RATIO } from '@/features/sms/quota';
import { readPlatformSms } from '@/features/sms/platform';
import { SmsGrantForm } from '@/features/sms/components/SmsGrantForm';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

const PAY_STATUS: Record<string, string> = {
  PENDING: 'Déclaré, à confirmer', PAID: 'Confirmé', FAILED: 'Échoué', REFUNDED: 'Remboursé', CANCELLED: 'Refusé',
};
const PAY_METHOD: Record<string, string> = {
  MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CASH: 'Espèces', CARD: 'Carte', OTHER: 'Autre',
};
import { SubscriptionForm } from '@/features/billing/components/SubscriptionForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Facturation établissement' };
export const dynamic = 'force-dynamic';

export default async function SchoolBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: school } = await supabase.from('schools').select('id, name, slug').eq('id', id).maybeSingle();
  if (!school) notFound();

  const mois = currentMonth();
  const [plans, sub, quota, grants, reglagesSms] = await Promise.all([
    listPlans(),
    getSchoolSubscription(id),
    readQuotaForSchool(id),
    listGrants(id),
    readPlatformSms(),
  ]);
  const grantDuMois = grants.find((g) => g.month === mois)?.quantity ?? 0;
  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount, currency, method, status, created_at, provider_reference, notes')
    .eq('school_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.assigned === '1' ? <Alert tone="success">Abonnement mis à jour.</Alert> : null}
      {sp.confirmed === '1' ? <Alert tone="success">Paiement confirmé.</Alert> : null}
      {sp.rejected === '1' ? <Alert tone="success">Paiement refusé.</Alert> : null}
      {sp.sms === '1' ? <Alert tone="success">Complément de SMS enregistré.</Alert> : null}
      <PageHeader title={`Facturation — ${school.name}`} action={<Link href="/admin/etablissements"><Button variant="ghost">Retour</Button></Link>} />

      <Card>
        <CardContent className="space-y-1 py-3 text-sm">
          <h2 className="text-sm font-medium">Abonnement actuel</h2>
          {sub ? (
            <p className="text-[color:var(--muted-foreground)]">
              {sub.plans?.name ?? '—'} · statut {sub.status}
              {sub.current_period_end ? ` · échéance ${sub.current_period_end.slice(0, 10)}` : ''}
            </p>
          ) : (
            <p className="text-[color:var(--muted-foreground)]">Aucun abonnement vivant.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-medium">{sub ? 'Modifier l’abonnement' : 'Assigner un abonnement'}</h2>
          {plans.length === 0 ? (
            <Alert tone="info">Créez d’abord un plan.</Alert>
          ) : (
            <SubscriptionForm
              action={assignSubscriptionAction.bind(null, id)}
              plans={plans.map((p) => ({ id: p.id, name: p.name }))}
              {...(sub
                ? {
                    defaults: {
                      // Abonnement "a la carte" (wizard d'inscription) : pas de forfait fixe a preselectionner.
                      ...(sub.plan_id ? { planId: sub.plan_id } : {}),
                      status: sub.status,
                      trialEndsAt: sub.trial_ends_at,
                      periodStart: sub.current_period_start,
                      periodEnd: sub.current_period_end,
                    },
                  }
                : {})}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">SMS du mois</h2>
            <p className="text-sm text-[color:var(--muted-foreground)]">{quotaLabel(quota)}</p>
          </div>

          {quota.unlimited ? (
            <Alert tone="info">
              Aucun quota n’est posé : tous les SMS de cet établissement partent, et c’est vous qui payez l’opérateur.
              Le nombre inclus se règle dans <Link href="/admin/sms" className="underline">les réglages SMS</Link> ou
              dans sa formule.
            </Alert>
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">Inclus</dt>
                  <dd className="tabular-nums">{quota.included.toLocaleString('fr-FR')}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">Accordé</dt>
                  <dd className="tabular-nums">{quota.granted.toLocaleString('fr-FR')}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">Restant</dt>
                  <dd className="tabular-nums">{quota.remaining.toLocaleString('fr-FR')}</dd>
                </div>
              </dl>
              {quota.remaining === 0 ? (
                <Alert tone="error">
                  Quota épuisé : les alertes d’absence de cet établissement ne partent plus. Les identifiants de
                  connexion, eux, continuent de partir.
                </Alert>
              ) : quota.ratio >= WARN_RATIO ? (
                <Alert tone="warning">Plus de {Math.round(WARN_RATIO * 100)} % du quota est consommé.</Alert>
              ) : null}
            </>
          )}

          <SmsGrantForm
            action={grantSmsAction.bind(null, id)}
            month={mois}
            current={grantDuMois}
            price={reglagesSms.pricePerSms}
          />

          {grants.length > 0 ? (
            <ul className="space-y-1 text-xs text-[color:var(--muted-foreground)]">
              {grants.map((g) => (
                <li key={g.id}>
                  {new Date(`${g.month}T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} ·{' '}
                  {g.quantity.toLocaleString('fr-FR')} SMS
                  {g.reason ? ` · ${g.reason}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Derniers paiements</h2>
        {(payments ?? []).length === 0 ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Aucun paiement enregistré.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(payments ?? []).map((p) => (
              <li key={p.id} className="space-y-2 rounded-[--radius-card] border px-3 py-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    {new Date(p.created_at).toLocaleDateString('fr-FR')} · {PAY_METHOD[p.method] ?? p.method}
                    {p.provider_reference ? ` · réf. ${p.provider_reference}` : ''}
                  </span>
                  <span className="font-medium">
                    {Number(p.amount).toLocaleString('fr-FR')} {p.currency} · {PAY_STATUS[p.status] ?? p.status}
                  </span>
                </div>
                {p.notes ? <p className="text-xs text-[color:var(--muted-foreground)]">{p.notes}</p> : null}
                {p.status === 'PENDING' ? (
                  <div className="flex flex-wrap gap-2">
                    <ConfirmSubmit
                      action={settlePaymentAction.bind(null, id, p.id, 'PAID')}
                      label="Confirmer"
                      variant="secondary"
                      confirmMessage={`Confirmer la réception de ${Number(p.amount).toLocaleString('fr-FR')} ${p.currency} ?`}
                    />
                    <ConfirmSubmit
                      action={settlePaymentAction.bind(null, id, p.id, 'CANCELLED')}
                      label="Refuser"
                      confirmMessage="Refuser ce paiement déclaré (non reçu ou référence introuvable) ?"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
