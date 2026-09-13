import type { Metadata } from 'next';
import Link from 'next/link';
import { getPlatformOverview } from '@/features/platform-dashboard/queries';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { KpiCard } from '@/features/dashboard/components/KpiCard';

export const metadata: Metadata = { title: 'Tableau de bord plateforme' };
export const dynamic = 'force-dynamic';

function formatWhen(iso: string): string {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "a l'instant";
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

export default async function PlatformDashboardPage() {
  const overview = await getPlatformOverview();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Tableau de bord plateforme" description="Vue d'ensemble de tous les etablissements" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Etablissements"
          value={overview.schools.total.toLocaleString('fr-FR')}
          {...(overview.schools.new30d > 0
            ? { trend: { direction: 'up' as const, text: `+${overview.schools.new30d} ce mois-ci` } }
            : {})}
        />
        <KpiCard label="Eleves (toutes ecoles)" value={overview.students.toLocaleString('fr-FR')} />
        <KpiCard label="Enseignants (toutes ecoles)" value={overview.teachers.toLocaleString('fr-FR')} />
        <KpiCard
          label="Abonnements actifs"
          value={overview.activeSubscriptions.toLocaleString('fr-FR')}
          {...(overview.mrr ? { unit: `· ${overview.mrr.amount.toLocaleString('fr-FR')} ${overview.mrr.currency}/mois` } : {})}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Actifs</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: 'var(--color-success)' }}>{overview.schools.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs font-medium text-[color:var(--muted-foreground)]">En attente</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: 'var(--color-warning)' }}>{overview.schools.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs font-medium text-[color:var(--muted-foreground)]">Suspendus</p>
            <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: 'var(--color-danger)' }}>{overview.schools.suspended}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Activite recente</h2>
            <Link href="/admin/etablissements" className="text-sm font-medium text-[color:var(--color-brand)] hover:underline">
              Tous les etablissements
            </Link>
          </div>
          {overview.activity.length === 0 ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">Aucune activite recente.</p>
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
