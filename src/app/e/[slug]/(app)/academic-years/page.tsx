import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listYears } from '@/features/academic-years/queries';
import { YEAR_STATUS_LABEL, formatDate } from '@/features/academic-years/labels';
import { activateYearAction, closeYearAction, reopenYearAction } from '@/features/academic-years/actions';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Annees scolaires' };

export default async function AcademicYearsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'academic_years.view');

  const years = await listYears(ctx);
  const base = `/e/${slug}/academic-years`;
  const canManage = hasPermission(ctx, 'academic_years.manage');
  const canClose = hasPermission(ctx, 'academic_years.close');
  const canReopen = hasPermission(ctx, 'academic_years.reopen');

  return (
    <div className="mx-auto max-w-3xl">
      <Flash searchParams={sp} />
      <PageHeader
        title="Annees scolaires"
        description="Une seule annee est active a la fois."
        action={
          canManage ? (
            <Link href={`${base}/new`}>
              <Button>Nouvelle annee</Button>
            </Link>
          ) : null
        }
      />

      {years.length === 0 ? (
        <EmptyState title="Aucune annee scolaire" hint="Creez une annee pour commencer a configurer l'etablissement." />
      ) : (
        <ul className="space-y-2">
          {years.map((y) => (
            <li key={y.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`${base}/${y.id}`} className="font-medium hover:underline">
                        {y.name}
                      </Link>
                      {y.is_current ? (
                        <span className="rounded-full bg-[color:var(--color-brand-muted)] px-2 py-0.5 text-xs text-[color:var(--color-brand)]">
                          Courante
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      {formatDate(y.starts_on)} — {formatDate(y.ends_on)} · {YEAR_STATUS_LABEL[y.status] ?? y.status}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canManage && !y.is_current && y.status !== 'CLOSED' ? (
                      <ConfirmSubmit
                        action={activateYearAction.bind(null, slug, y.id)}
                        label="Activer"
                        variant="secondary"
                        confirmMessage={`Activer l'annee « ${y.name} » ? Elle deviendra l'annee courante.`}
                      />
                    ) : null}
                    {canClose && y.status === 'ACTIVE' ? (
                      <ConfirmSubmit
                        action={closeYearAction.bind(null, slug, y.id)}
                        label="Cloturer"
                        confirmMessage={`Cloturer l'annee « ${y.name} » ? Ses donnees passeront en lecture seule.`}
                      />
                    ) : null}
                    {canReopen && y.status === 'CLOSED' ? (
                      <ConfirmSubmit
                        action={reopenYearAction.bind(null, slug, y.id)}
                        label="Rouvrir"
                        variant="secondary"
                        confirmMessage={`Rouvrir l'annee « ${y.name} » ?`}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
