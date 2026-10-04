import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getPlatformOverview } from '@/features/platform-dashboard/queries';
import { schoolsHref } from '@/features/platform-schools/filters';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/features/dashboard/components/KpiCard';

export const metadata: Metadata = { title: 'Tableau de bord plateforme' };
export const dynamic = 'force-dynamic';

function formatWhen(iso: string): string {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "à l'instant";
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

/**
 * Un compteur de la plateforme. Il est TOUJOURS un lien : chaque chiffre d'ici
 * mène à la liste qu'il compte — « Suspendus » aux écoles suspendues, « Essais
 * qui se terminent » à ces écoles-là. Un chiffre qui appelle le clic sans mener
 * nulle part est la pire des promesses.
 */
function Counter({
  label,
  value,
  color,
  hint,
  href,
}: {
  label: string;
  value: number;
  color: string;
  hint?: string;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-transform hover:-translate-y-0.5 motion-reduce:hover:transform-none">
        <CardContent className="py-3">
          <p className="flex items-center justify-between gap-2 text-xs font-medium text-[color:var(--muted-foreground)]">
            <span>{label}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums" style={{ color }}>
            {value}
          </p>
          {hint ? <p className="text-xs text-[color:var(--muted-foreground)]">{hint}</p> : null}
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function PlatformDashboardPage() {
  const overview = await getPlatformOverview();

  // Une liste courte, et seulement ce qui appelle un geste aujourd'hui.
  const toDo: { label: string; href: string; action: string }[] = [
    ...(overview.pendingPayments.count > 0
      ? [
          {
            label: `${overview.pendingPayments.count} règlement(s) déclaré(s) en attente de confirmation`,
            href: '/admin/paiements',
            action: 'Confirmer',
          },
        ]
      : []),
    ...(overview.schools.pending > 0
      ? [
          {
            label: `${overview.schools.pending} établissement(s) en attente d'activation`,
            href: schoolsHref({ statut: 'PENDING' }),
            action: 'Ouvrir',
          },
        ]
      : []),
    ...(overview.pastDue > 0
      ? [
          {
            label: `${overview.pastDue} abonnement(s) en retard de paiement`,
            href: schoolsHref({ abonnement: 'retard' }),
            action: 'Voir',
          },
        ]
      : []),
    ...(overview.trialsEndingSoon > 0
      ? [
          {
            label: `${overview.trialsEndingSoon} essai(s) se termine(nt) dans les 30 jours`,
            href: schoolsHref({ abonnement: 'essai-bientot' }),
            action: 'Voir',
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Tableau de bord plateforme" description="Vue d'ensemble de tous les établissements" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Établissements"
          value={overview.schools.total.toLocaleString('fr-FR')}
          href="/admin/etablissements"
          {...(overview.schools.new30d > 0
            ? { trend: { direction: 'up' as const, text: `+${overview.schools.new30d} ce mois-ci` } }
            : {})}
        />
        {/* Les élèves se détaillent école par école dans les statistiques ; les
            enseignants, dans la liste des établissements. */}
        <KpiCard
          label="Élèves (toutes écoles)"
          value={overview.students.toLocaleString('fr-FR')}
          href="/admin/statistiques"
        />
        <KpiCard
          label="Enseignants (toutes écoles)"
          value={overview.teachers.toLocaleString('fr-FR')}
          href="/admin/etablissements"
        />
        <KpiCard
          label="Abonnements actifs"
          value={overview.activeSubscriptions.toLocaleString('fr-FR')}
          href={schoolsHref({ abonnement: 'actif' })}
          {...(overview.mrr ? { unit: `· ${overview.mrr.amount.toLocaleString('fr-FR')} ${overview.mrr.currency}/mois` } : {})}
        />
      </div>

      {/* Ce qui attend une décision : d'abord ce sur quoi il faut agir. */}
      {toDo.length > 0 ? (
        <Card>
          <CardContent className="py-3">
            <p className="mb-2 text-sm font-semibold">À traiter</p>
            <ul className="space-y-1.5 text-sm">
              {toDo.map((t) => (
                <li key={t.href} className="flex items-center justify-between gap-3">
                  <span>{t.label}</span>
                  <Link href={t.href} className="shrink-0 text-sm font-medium text-[color:var(--color-brand)] hover:underline">
                    {t.action}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Counter
          label="Actifs"
          value={overview.schools.active}
          color="var(--color-success)"
          href={schoolsHref({ statut: 'ACTIVE' })}
        />
        <Counter
          label="En attente"
          value={overview.schools.pending}
          color="var(--color-warning)"
          href={schoolsHref({ statut: 'PENDING' })}
        />
        <Counter
          label="Suspendus"
          value={overview.schools.suspended}
          color="var(--color-danger)"
          href={schoolsHref({ statut: 'SUSPENDED' })}
        />
        <Counter
          label="Archivés"
          value={overview.schools.archived}
          color="var(--muted-foreground)"
          href={schoolsHref({ statut: 'ARCHIVED' })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Counter
          label="Règlements déclarés"
          value={overview.pendingPayments.count}
          color="var(--color-warning)"
          href="/admin/paiements"
          hint={
            overview.pendingPayments.count > 0 && overview.pendingPayments.currency
              ? `${overview.pendingPayments.amount.toLocaleString('fr-FR')} ${overview.pendingPayments.currency} à confirmer`
              : 'Rien à confirmer'
          }
        />
        <Counter
          label="Essais qui se terminent"
          value={overview.trialsEndingSoon}
          color="var(--color-brand)"
          href={schoolsHref({ abonnement: 'essai-bientot' })}
          hint="Dans les 30 jours"
        />
        <Counter
          label="Écoles à formule réduite"
          value={overview.schoolsWithDisabledModules}
          color="var(--muted-foreground)"
          href={schoolsHref({ modulesReduits: true })}
          hint="Au moins un module coupé"
        />
      </div>

      <Card>
        <CardContent>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Activité récente</h2>
            <Link href="/admin/journal" className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
              Tout le journal
            </Link>
          </div>
          {overview.activity.length === 0 ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">Aucune activité récente.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {overview.activity.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <span>
                    {item.label}
                    {item.schoolName ? <span className="text-[color:var(--muted-foreground)]"> · {item.schoolName}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-[color:var(--muted-foreground)]">{formatWhen(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
