import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AutoRefresh } from '@/features/school-backup/components/BackupForms';

export const metadata: Metadata = { title: 'Paiement' };
export const dynamic = 'force-dynamic';

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;

/**
 * Retour de PayDunya (0157). Hors du cadre habituel de l'école : une école dont
 * l'accès est coupé doit voir ici que son paiement est passé. La page ne croit
 * pas le retour du navigateur : elle relit le statut chez PayDunya.
 */
export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  if (!hasPermission(ctx, 'billing.view') && !hasPermission(ctx, 'billing.manage') && !ctx.isPlatformAdmin) notFound();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from('payments').select('id, school_id, amount, fee_amount, purpose, sms_quantity, notes, checkout_url').eq('id', id).maybeSingle();
  const p = data as unknown as {
    id: string; school_id: string; amount: number; fee_amount: number; purpose: string; sms_quantity: number | null; notes: string | null; checkout_url: string | null;
  } | null;
  if (!p || p.school_id !== ctx.school.id) notFound();

  const { checkOnlinePayment } = await import('@/services/online-payments');
  const state = await checkOnlinePayment(id).catch(() => null);
  const total = Number(p.amount) + Number(p.fee_amount);
  const what = p.purpose === 'SMS_PACK' ? `Pack de ${p.sms_quantity} SMS` : (p.notes?.split(' — abonnement : ')[1] ?? 'Abonnement');
  const base = `/e/${slug}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-5 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted-foreground)]">{ctx.school.name}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Paiement en ligne</h1>
        <p className="mt-1 text-[color:var(--muted-foreground)]">
          {what} · {money(total)}
          {Number(p.fee_amount) > 0 ? ` (dont ${money(Number(p.fee_amount))} de frais)` : ''}
        </p>
      </div>

      {!state || state.status === 'PENDING' ? (
        <>
          <AutoRefresh seconds={5} />
          <Alert tone="warning">
            <b>{sp.annule ? 'Paiement non terminé.' : 'Paiement en cours de confirmation…'}</b>
            <br />
            {sp.annule
              ? 'Vous êtes revenu sans payer. Rien n’a été prélevé ; vous pouvez reprendre le paiement.'
              : 'Cela prend en général moins d’une minute. Cette page se met à jour toute seule ; vous pouvez aussi la fermer : le paiement sera pris en compte quand même.'}
          </Alert>
          {p.checkout_url ? (
            <a href={p.checkout_url}>
              <Button variant="secondary">Reprendre le paiement chez PayDunya</Button>
            </a>
          ) : null}
        </>
      ) : state.status === 'PAID' ? (
        <Alert tone="success">
          <b>Paiement reçu : {money(total)}.</b>
          <br />
          {p.purpose === 'SMS_PACK' ? `${p.sms_quantity} SMS ont été ajoutés à votre crédit du mois.` : 'Votre abonnement est prolongé jusqu’au 31 août et l’accès est rétabli.'}
          {state.receipt ? (
            <>
              <br />
              Reçu n° <b>{state.receipt}</b>
            </>
          ) : null}
        </Alert>
      ) : (
        <Alert tone="error">
          <b>Paiement {state.status === 'FAILED' ? 'refusé' : 'annulé'}.</b> Rien n’a été prélevé{state.reason ? ` (${state.reason})` : ''}. Vous pouvez réessayer.
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/facturation`}>
          <Button>{state?.status === 'PAID' ? 'Voir mon abonnement et mes reçus' : 'Retour à la facturation'}</Button>
        </Link>
        <Link href={`${base}/dashboard`}>
          <Button variant="ghost">Tableau de bord</Button>
        </Link>
      </div>
    </main>
  );
}
