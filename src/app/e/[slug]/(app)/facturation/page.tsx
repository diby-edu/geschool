import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { readBilling } from '@/features/billing/subscription';
import { readSmsQuota } from '@/features/sms/quota';
import { payModulesOnlineAction } from '@/features/billing/online-actions';
import { ModulePicker, type PickerModule } from '@/features/billing/components/ModulePicker';
import { MODULES as CATALOGUE } from '@/features/onboarding/catalog';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Abonnement' };
export const dynamic = 'force-dynamic';

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;
const jour = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('fr-FR');

/** Couleurs des cartes, comme sur la page d'accueil (PricingConfigurator). */
const LOOK: Record<string, { a: string; b: string }> = {
  SCOL: { a: '#4a44e0', b: '#8b5cf6' },
  APPEL: { a: '#12a99b', b: '#16a06a' },
};

const SITUATION: Record<string, { texte: string; tone: 'success' | 'warning' | 'error' | 'info' }> = {
  ACTIVE: { texte: 'Abonnée', tone: 'success' },
  TRIALING: { texte: 'En essai gratuit', tone: 'info' },
  EXPIRED: { texte: 'Abonnement expiré', tone: 'error' },
  PAST_DUE: { texte: 'Abonnement expiré', tone: 'error' },
};

/**
 * Abonnement de l'école (maquette docs/maquettes/abonnement-ecole.html) : tous
 * les modules présentés comme sur la page d'accueil, à cocher, et payés en
 * ligne d'un coup (PayDunya, 0157). Plus bas : les SMS et les reçus.
 */
export default async function FacturationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'billing.view');

  const { readOnlineOffer } = await import('@/services/online-payments');
  const [billing, offer, quota] = await Promise.all([readBilling(ctx, 10), readOnlineOffer().catch(() => null), readSmsQuota(ctx).catch(() => null)]);
  const canManage = hasPermission(ctx, 'billing.manage');
  const base = `/e/${slug}`;

  const describe = (code: string, fallbackName: string, fallbackDesc: string) => {
    const c = CATALOGUE.find((m) => m.code === code);
    return { name: c?.name ?? fallbackName, icon: c?.icon ?? '📦', desc: c?.desc ?? fallbackDesc, benefits: c ? [...c.benefits] : [], ...(LOOK[code] ?? { a: '#4a44e0', b: '#6d66f0' }) };
  };
  const modules: PickerModule[] = [
    ...billing.modules.map((m) => ({
      code: m.code,
      ...describe(m.code, m.name, m.description),
      price: m.pricePaid ?? m.price,
      subscribed: true,
      endsOn: m.endsOn,
      expired: m.expired,
      demo: m.mode === 'DEMO',
    })),
    ...billing.available.map((m) => ({
      code: m.code,
      ...describe(m.code, m.name, m.description),
      price: m.price,
      subscribed: false,
      endsOn: null,
      expired: false,
      demo: false,
    })),
  ];

  const situation = ctx.billing ? SITUATION[ctx.billing.situation] : null;
  const echus = billing.modules.filter((m) => m.expired);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {sp.paye === '1' ? <Alert tone="success">Paiement enregistré. Votre reçu est disponible ci-dessous.</Alert> : null}
      <PageHeader
        title="Abonnement"
        description={`${ctx.school.name}${situation ? ` · ${situation.texte}` : ''}${ctx.billing?.endsOn ? ` · jusqu’au ${jour(ctx.billing.endsOn)}` : ''}`}
      />
      {echus.length > 0 ? (
        <Alert tone="error">
          {echus.length === 1 ? `Le module « ${echus[0]!.name} » est échu : ses écrans se ferment.` : `${echus.length} modules sont échus : leurs écrans se ferment.`} Cochez-le
          ci-dessous et payez pour le rouvrir.
        </Alert>
      ) : null}
      {!canManage ? <Alert tone="info">Seule la direction peut payer l’abonnement. Vous voyez ici ce que l’école a souscrit.</Alert> : null}

      <ModulePicker
        modules={modules}
        canPay={canManage}
        online={Boolean(offer?.open)}
        feePct={offer?.feePct ?? 0}
        manualHref={`${base}/facturation/payer`}
        action={payModulesOnlineAction.bind(null, slug, null)}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-2">
            <h2 className="text-sm font-semibold">SMS</h2>
            {quota ? (
              <p className="text-sm">
                {quota.unlimited ? 'Aucune limite ce mois-ci.' : `${quota.used.toLocaleString('fr-FR')} / ${quota.limit.toLocaleString('fr-FR')} utilisés ce mois-ci.`}
              </p>
            ) : null}
            <Link href={`${base}/parametres/sms`} className="text-sm font-bold text-[color:var(--color-brand)] hover:underline">
              {offer?.open && canManage ? 'Acheter des SMS' : 'Voir les SMS'}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Mes reçus</h2>
              <Link href={`${base}/facturation/recus`} className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
                Tous les reçus
              </Link>
            </div>
            {billing.receipts.length === 0 ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">Aucun reçu pour l’instant. Chaque paiement confirmé en produit un, numéroté.</p>
            ) : (
              <ul className="divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
                {billing.receipts.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>
                      <b>{r.number}</b> · {r.label}
                    </span>
                    <span className="tabular-nums text-[color:var(--muted-foreground)]">
                      {money(r.amount)} · {jour(r.issuedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
