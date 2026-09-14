import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getConfig, listCyclesOverview } from '@/features/schedule/config';
import { listRequirements } from '@/features/schedule/requirements';
import { listGenerationJobs } from '@/features/schedule/generation';
import {
  syncRequirementsAction,
  generateScheduleAction,
} from '@/features/schedule/actions';
import { RequirementsTable } from '@/features/schedule/components/RequirementsTable';
import { GenerateForm } from '@/features/schedule/components/GenerateForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Generation de l\'emploi du temps' };

const JOB_STATUS: Record<string, string> = {
  QUEUED: 'En file',
  RUNNING: 'En cours',
  SUCCEEDED: 'Reussie',
  INFEASIBLE: 'Impossible',
  FAILED: 'Echec',
  CANCELLED: 'Annulee',
};

export default async function GeneratePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'schedule.generate');
  const base = `/e/${slug}/schedule`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Generation" />
        <EmptyState title="Aucune annee active" hint="Activez une annee scolaire d'abord." />
      </div>
    );
  }

  const yearId = ctx.academicYear.id;
  const config = await getConfig(ctx, yearId);
  const cyclesOverview = await listCyclesOverview(ctx, yearId);
  const cyclesWithOwnGrid = cyclesOverview.filter((c) => c.configId).map((c) => ({ id: c.id, name: c.name }));
  // Une grille existe des qu'il y a soit la grille par defaut, soit au moins
  // une grille de cycle — un etablissement entierement decoupe en cycles
  // (§ decision "pause par cycle") n'a jamais de grille par defaut du tout.
  const hasAnyGrid = config !== null || cyclesWithOwnGrid.length > 0;
  const requirements = hasAnyGrid ? await listRequirements(ctx, yearId) : [];
  const jobs = hasAnyGrid ? await listGenerationJobs(ctx, yearId, 5) : [];
  const activeCount = requirements.filter((r) => r.status === 'ACTIVE').length;
  const targetVersionId = typeof sp.version === 'string' ? sp.version : undefined;

  const canSync = hasPermission(ctx, 'schedule.create');
  const canEdit = hasPermission(ctx, 'schedule.update');
  const canDelete = hasPermission(ctx, 'schedule.delete');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Flash searchParams={sp} />
      {sp.synced !== undefined ? (
        <Alert tone="success">
          {sp.synced} exigence(s) creee(s) depuis les affectations{sp.kept && sp.kept !== '0' ? `, ${sp.kept} conservee(s).` : '.'}
        </Alert>
      ) : null}
      {sp.updated === '1' ? <Alert tone="success">Exigence mise a jour.</Alert> : null}
      {sp.reqdeleted === '1' ? <Alert tone="success">Exigence supprimee.</Alert> : null}

      <PageHeader
        title="Generation de l'emploi du temps"
        description={`Annee ${ctx.academicYear.name}`}
        action={
          <Link href={base}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />

      {!hasAnyGrid ? (
        <EmptyState
          title="Horaires non configures"
          hint="Definissez d'abord les jours et horaires de cette annee, depuis Annees scolaires."
        />
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  Exigences pedagogiques
                </h2>
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  Le besoin a placer : matiere, cible, enseignant, nombre de seances, salle.
                </p>
              </div>
              {canSync ? (
                <SimpleSubmit action={syncRequirementsAction.bind(null, slug)} label="Synchroniser depuis les affectations" small />
              ) : null}
            </div>

            {requirements.length === 0 ? (
              <EmptyState
                title="Aucune exigence"
                hint="Synchronisez depuis les affectations pour convertir les volumes horaires en seances a placer."
              />
            ) : (
              <RequirementsTable slug={slug} rows={requirements} canEdit={canEdit && canDelete} />
            )}
          </section>

          <GenerateForm
            action={generateScheduleAction.bind(null, slug)}
            requirementCount={activeCount}
            cycles={cyclesWithOwnGrid}
            hasDefaultGrid={config !== null}
            {...(targetVersionId ? { targetVersionId } : {})}
          />

          {jobs.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
                Dernieres generations
              </h2>
              <ul className="space-y-2">
                {jobs.map((j) => (
                  <li key={j.id} className="rounded-[--radius-card] border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{JOB_STATUS[j.status] ?? j.status}</span>
                      <span className="text-xs text-[color:var(--muted-foreground)]">
                        {new Date(j.created_at).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      {j.sessions_count != null ? `${j.sessions_count} seance(s) placee(s)` : '—'}
                      {j.solver_status ? ` · ${j.solver_status}` : ''}
                      {j.duration_ms != null ? ` · ${(j.duration_ms / 1000).toFixed(1)} s` : ''}
                    </p>
                    {j.problems.length > 0 ? (
                      <ul className="mt-1 list-disc pl-5 text-xs text-[color:var(--muted-foreground)]">
                        {j.problems.slice(0, 4).map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
