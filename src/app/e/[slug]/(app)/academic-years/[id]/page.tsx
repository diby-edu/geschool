import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getYear, listPeriods } from '@/features/academic-years/queries';
import { YEAR_STATUS_LABEL, PERIOD_KIND_LABEL, formatDate } from '@/features/academic-years/labels';
import { updateYearAction, createPeriodAction, deletePeriodAction } from '@/features/academic-years/actions';
import { YearForm } from '@/features/academic-years/components/YearForm';
import { PeriodCreateForm } from '@/features/academic-years/components/PeriodCreateForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: "Annee scolaire" };

export default async function YearDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'academic_years.view');

  const year = await getYear(ctx, id);
  if (!year) notFound();
  const periods = await listPeriods(ctx, id);
  const canManage = hasPermission(ctx, 'academic_years.manage');
  const editable = year.status === 'DRAFT' || year.status === 'ACTIVE';
  const nextSeq = periods.reduce((m, p) => Math.max(m, p.sequence), 0) + 1;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title={year.name}
        description={`${formatDate(year.starts_on)} — ${formatDate(year.ends_on)} · ${YEAR_STATUS_LABEL[year.status] ?? year.status}`}
        action={
          <Link href={`/e/${slug}/academic-years`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      {canManage && editable ? (
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Informations
          </h2>
          <YearForm
            action={updateYearAction.bind(null, slug, id)}
            submitLabel="Enregistrer"
            defaultValues={{ name: year.name, startsOn: year.starts_on, endsOn: year.ends_on }}
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Periodes
        </h2>
        {periods.length === 0 ? (
          <EmptyState title="Aucune periode" hint="Ajoutez les trimestres ou semestres de cette annee." />
        ) : (
          <ul className="space-y-2">
            {periods.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium">{p.name}</span>{' '}
                      <span className="text-xs text-[color:var(--muted-foreground)]">
                        {PERIOD_KIND_LABEL[p.kind] ?? p.kind} · {formatDate(p.starts_on)} — {formatDate(p.ends_on)}
                        {p.is_grading_period ? ' · notation' : ''}
                      </span>
                    </div>
                    {canManage && editable ? (
                      <ConfirmSubmit
                        action={deletePeriodAction.bind(null, slug, id, p.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer la periode « ${p.name} » ?`}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {canManage && editable ? (
          <PeriodCreateForm action={createPeriodAction.bind(null, slug, id)} nextSequence={nextSeq} />
        ) : null}
      </section>
    </div>
  );
}
