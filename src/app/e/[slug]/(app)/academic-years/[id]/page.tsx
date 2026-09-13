import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getYear, listPeriods } from '@/features/academic-years/queries';
import { YEAR_STATUS_LABEL, PERIOD_KIND_LABEL, formatDate } from '@/features/academic-years/labels';
import { updateYearAction, createPeriodAction, deletePeriodAction } from '@/features/academic-years/actions';
import { getConfig, getDayHours } from '@/features/schedule/config';
import { saveConfigAction } from '@/features/schedule/actions';
import { YearForm } from '@/features/academic-years/components/YearForm';
import { PeriodCreateForm } from '@/features/academic-years/components/PeriodCreateForm';
import { ConfigForm } from '@/features/schedule/components/ConfigForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
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

  // Jours et horaires : donnee propre a CETTE annee (schedule_configurations
  // porte un academic_year_id), pas un reglage general de l'etablissement —
  // au meme titre que les periodes ci-dessous. Droit distinct de
  // 'academic_years.manage' : un censeur peut configurer les horaires sans
  // pouvoir renommer l'annee ou en creer une nouvelle.
  const canManageHours = hasPermission(ctx, 'schedule.manage_configuration');
  const config = canManageHours ? await getConfig(ctx, id) : null;
  const dayHours = config ? await getDayHours(ctx, config.id) : [];
  const hoursDefaults = config
    ? { workingDays: config.working_days as number[], dayHours, slotMinutes: config.default_session_minutes as number }
    : { workingDays: [1, 2, 3, 4, 5], dayHours: [], slotMinutes: 55 };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      {sp.configured === '1' ? <Alert tone="success">Horaires enregistrés.</Alert> : null}
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

      {canManageHours && editable ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
              Jours et horaires
            </h2>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              Jours d&apos;ouverture de cette année et horaire de chacun — utilisés pour construire l&apos;emploi du temps.
            </p>
          </div>
          <ConfigForm action={saveConfigAction.bind(null, slug, id)} defaults={hoursDefaults} />
        </section>
      ) : null}
    </div>
  );
}
