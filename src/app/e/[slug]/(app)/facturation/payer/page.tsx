import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { readBilling } from '@/features/billing/subscription';
import { readPaymentSettings, onlineOpen } from '@/features/billing/payment-settings';
import { recordPaymentAction } from '@/features/billing/actions';
import { PaymentForm } from '@/features/billing/components/PaymentForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Payer' };
export const dynamic = 'force-dynamic';

const money = (n: number, c: string) => `${Math.round(n).toLocaleString('fr-FR')} ${c === 'XOF' ? 'F' : c}`;

/**
 * Payer un module : renouvellement ou nouvelle souscription.
 *
 * Tant que la passerelle Mobile Money n'est pas ouverte, l'ecran le DIT et
 * donne le chemin qui marche vraiment — verser sur le numero de l'editeur,
 * puis signaler la reference. Un bouton « Payer maintenant » qui ne
 * prelèverait rien vaudrait moins que cette phrase.
 */
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'billing.manage');

  const code = typeof sp.module === 'string' ? sp.module : null;
  const [billing, paiement] = await Promise.all([readBilling(ctx), readPaymentSettings()]);

  const souscrit = billing.modules.find((m) => m.code === code) ?? null;
  const offre = billing.available.find((m) => m.code === code) ?? null;
  if (code && !souscrit && !offre) notFound();

  const nom = souscrit?.name ?? offre?.name ?? null;
  const montant = souscrit ? (souscrit.pricePaid ?? souscrit.price) : (offre?.price ?? null);
  const devise = souscrit?.currency ?? offre?.currency ?? 'XOF';
  const renouvellement = souscrit !== null;
  const enLigne = onlineOpen(paiement);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title={renouvellement ? 'Renouveler' : nom ? 'Souscrire' : 'Payer'}
        description={nom ?? 'Votre abonnement'}
        action={
          <Link href={`/e/${slug}/facturation`}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      {nom && montant !== null ? (
        <Card>
          <CardContent className="flex flex-wrap items-baseline justify-between gap-2 py-4">
            <div>
              <p className="font-semibold">{nom}</p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                {renouvellement
                  ? souscrit!.endsOn
                    ? `Échéance actuelle : ${new Date(`${souscrit!.endsOn}T00:00:00`).toLocaleDateString('fr-FR')}`
                    : 'Sans échéance'
                  : 'Nouvelle souscription — un an'}
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums">{money(montant, devise)}</p>
          </CardContent>
        </Card>
      ) : null}

      {enLigne ? (
        <Alert tone="info">
          Le paiement en ligne est ouvert ({paiement.provider}). Il se conclut sur votre téléphone, et votre reçu
          s’émet aussitôt.
        </Alert>
      ) : (
        <Card>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Le paiement dans l’application n’est pas encore ouvert</p>
              <p className="mt-0.5 text-sm text-[color:var(--muted-foreground)]">
                En attendant, versez par Mobile Money puis signalez la référence ci-dessous. Votre reçu est émis dès
                que le versement est confirmé.
              </p>
            </div>

            {paiement.mobileMoneyNumber ? (
              <div className="rounded-xl border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--surface)' }}>
                <p>
                  Numéro&nbsp;: <strong className="font-mono">{paiement.mobileMoneyNumber}</strong>
                </p>
                {paiement.mobileMoneyName ? (
                  <p className="text-[color:var(--muted-foreground)]">
                    Au nom de <strong>{paiement.mobileMoneyName}</strong> — vérifiez ce nom sur votre téléphone avant
                    de valider.
                  </p>
                ) : null}
                {paiement.instructions ? (
                  <p className="mt-1 whitespace-pre-line text-[color:var(--muted-foreground)]">{paiement.instructions}</p>
                ) : null}
              </div>
            ) : (
              <Alert tone="warning">
                Aucune coordonnée de versement n’est publiée pour l’instant. Contactez la plateforme avant de payer —
                ne versez sur aucun numéro qui ne viendrait pas d’elle.
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <h2 className="mb-1 text-sm font-semibold">J’ai payé — signaler le versement</h2>
          <p className="mb-3 text-xs text-[color:var(--muted-foreground)]">
            Indiquez le montant et la référence de la transaction. Aucun prélèvement n’est effectué ici&nbsp;: la
            plateforme vérifie puis confirme, et votre reçu est émis.
          </p>
          <PaymentForm action={recordPaymentAction.bind(null, slug)} canSetStatus={ctx.isPlatformAdmin} />
        </CardContent>
      </Card>
    </div>
  );
}
