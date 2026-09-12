import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listPlans, getSchoolSubscription } from '@/features/billing/platform';
import { assignSubscriptionAction } from '@/features/billing/actions';
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

  const [plans, sub] = await Promise.all([listPlans(), getSchoolSubscription(id)]);
  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount, currency, method, status, created_at')
    .eq('school_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.assigned === '1' ? <Alert tone="success">Abonnement mis à jour.</Alert> : null}
      <PageHeader title={`Facturation — ${school.name}`} action={<Link href="/admin"><Button variant="ghost">Retour</Button></Link>} />

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
                      planId: sub.plan_id,
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

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Derniers paiements</h2>
        {(payments ?? []).length === 0 ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Aucun paiement enregistré.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(payments ?? []).map((p) => (
              <li key={p.id} className="flex justify-between rounded-[--radius-card] border px-3 py-2">
                <span>{new Date(p.created_at).toLocaleDateString('fr-FR')} · {p.method}</span>
                <span className="font-medium">{Number(p.amount).toLocaleString('fr-FR')} {p.currency} · {p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
