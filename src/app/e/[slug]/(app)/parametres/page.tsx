import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny } from '@/lib/permissions/guard';
import { hasAnyPermission } from '@/lib/permissions';
import { HUB, HUB_PERMISSIONS, HUB_TONE_COLOR } from '@/features/settings/hub';
import { featureEnabled } from '@/lib/modules/features';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';

export const metadata: Metadata = { title: 'Paramètres' };

export default async function SettingsHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, HUB_PERMISSIONS);

  // Une carte n'apparaît que si son accès est ouvert ; une section vide disparaît.
  // Une carte disparaît si le droit manque, ou si la plateforme a coupé le module.
  const sections = HUB.map((s) => ({
    ...s,
    cards: s.cards.filter(
      (c) => hasAnyPermission(ctx, c.any) && (!c.feature || featureEnabled(ctx.disabledFeatures, c.feature)),
    ),
  })).filter(
    (s) => s.cards.length > 0,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Flash searchParams={sp} />
      <PageHeader title="Paramètres" description="Configurez votre établissement : identité, pédagogie, comptes et abonnement." />

      {sections.map((section) => {
        const color = HUB_TONE_COLOR[section.tone];
        return (
          <section key={section.id} aria-labelledby={`hub-${section.id}`} className="space-y-3">
            <div className="flex items-center gap-2 border-b border-dashed pb-2">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <h2 id={`hub-${section.id}`} className="text-xs font-semibold uppercase tracking-wider text-[color:var(--muted-foreground)]">
                {section.label}
              </h2>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.cards.map((card) => {
                const Icon = card.icon;
                return (
                  <li key={card.path}>
                    <Link
                      href={`/e/${slug}/${card.path}`}
                      className="group flex h-full items-start gap-3 rounded-[--radius-card] border p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ backgroundColor: 'var(--surface)', outlineColor: color }}
                    >
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
                        style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{card.title}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-[color:var(--muted-foreground)]">
                          {card.description}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="mt-1 h-4 w-4 shrink-0 text-[color:var(--muted-foreground)] transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
