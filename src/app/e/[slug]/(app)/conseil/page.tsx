import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { buildMatrix, canSeeMatrix } from '@/features/reporting/matrix';
import { fmt } from '@/features/reporting/matrix-core';
import { MatrixTable } from '@/features/reporting/components/MatrixTable';
import { CouncilAverageForm } from '@/features/reporting/components/CouncilAverageForm';
import { computedGeneralAverages, listCouncilAverages } from '@/features/reporting/council';
import { savePreviousSchoolAction, setCouncilAverageAction } from '@/features/reporting/council-actions';
import { PreviousSchoolForm } from '@/features/reporting/components/PreviousSchoolForm';
import { previousSchoolAverages } from '@/features/reporting/previous-school';
import { loadClassVerification } from '@/features/grading/head-teacher';
import { ClassVerificationCard } from '@/features/grading/components/ClassVerificationCard';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Conseil de classe' };

/**
 * Le conseil de classe : il se tient à la date prévue QUOI QU'IL ARRIVE.
 * L'application prévient (classe non certifiée, signalements non réglés, avec
 * le nom du professeur) sans rien bloquer. La matrice du conseil rappelle les
 * périodes précédentes et, en fin d'année, la moyenne annuelle. Le conseil
 * peut retenir une moyenne (repêchage, dérogation) : elle remplace la moyenne
 * calculée sur le bulletin, sans mention, et le rang est recalculé.
 */
export default async function CouncilPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  const classId = typeof sp.class === 'string' ? sp.class : '';
  const periodId = typeof sp.period === 'string' ? sp.period : '';
  if (!classId || !periodId) {
    return <EmptyState title="Classe et période manquantes" hint="Ouvrez le conseil de classe depuis la page Bulletins." />;
  }
  const canMatrix = await canSeeMatrix(ctx, classId);
  const canRetain = hasPermission(ctx, 'reports.council_average');
  if (!canMatrix && !canRetain && !hasPermission(ctx, 'reports.validate')) notFound();

  const [matrix, verification, retained, computed] = await Promise.all([
    buildMatrix(ctx, classId, periodId, { council: true }),
    loadClassVerification(ctx, classId, periodId),
    listCouncilAverages(ctx, classId, periodId),
    canRetain ? computedGeneralAverages(ctx, classId, periodId) : Promise.resolve(new Map<string, number | null>()),
  ]);
  const here = `/e/${slug}/conseil?class=${classId}&period=${periodId}`;
  // Élèves arrivés en cours d'année : une période rappelée sans moyenne chez nous.
  const recallIds = matrix.recallPeriodIds ?? [];
  const newcomers = matrix.rows.filter((r) => (r.recallSources ?? []).some((src) => src !== 'OURS'));
  const canPrevious = matrix.newcomerMode === 'PREVIOUS_SCHOOL' && hasPermission(ctx, 'reports.generate');
  const external =
    canPrevious && newcomers.length > 0
      ? await previousSchoolAverages(ctx, newcomers.map((r) => r.studentId), recallIds)
      : new Map<string, { average: number; school: string | null }>();
  const certified = verification.status.certifiedAt !== null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Conseil de classe — ${matrix.className}`}
        description={`${matrix.periodName} · ${matrix.rows.length} élèves`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/e/${slug}/matrice?class=${classId}&period=${periodId}&type=conseil&retour=${encodeURIComponent(here)}`}>
              <Button variant="secondary" size="sm">Imprimer la matrice du conseil</Button>
            </Link>
            <a href={`/e/${slug}/api/matrice?class=${classId}&period=${periodId}&type=conseil`}>
              <Button variant="ghost" size="sm">Excel</Button>
            </a>
            <Link href={`/e/${slug}/bulletins?class=${classId}&period=${periodId}`}>
              <Button variant="ghost" size="sm">Bulletins</Button>
            </Link>
          </div>
        }
      />

      {sp.saved ? <Alert tone="success">Décision enregistrée. Régénérez les bulletins de la classe pour qu’elle y figure.</Alert> : null}

      {!certified ? (
        <Alert tone="error">
          Attention : cette classe n’a pas été certifiée par son professeur principal. Le conseil peut se tenir ; les
          points en attente sont listés ci-dessous.
        </Alert>
      ) : null}
      <ClassVerificationCard ctx={ctx} slug={slug} classId={classId} periodId={periodId} v={verification} matrix={canMatrix} onCouncil />

      {canMatrix ? <MatrixTable matrix={matrix} /> : null}

      {sp.nouveau ? <Alert tone="success">Moyenne de l’ancienne école enregistrée.</Alert> : null}
      {newcomers.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Élèves arrivés en cours d’année ({newcomers.length})
          </h2>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            {matrix.newcomerMode === 'PREVIOUS_SCHOOL'
              ? 'Règle de l’établissement : on saisit les moyennes de leur ancienne école pour les périodes manquantes. Tant qu’il en manque, pas de moyenne annuelle.'
              : 'Règle de l’établissement : leur moyenne annuelle se calcule sur les périodes faites chez vous. (Réglable dans le modèle de bulletin.)'}
          </p>
          <ul className="divide-y rounded-[--radius-card] border text-sm" style={{ borderColor: 'var(--border)' }}>
            {newcomers.map((r) => (
              <li key={r.studentId} id={`n-${r.studentId}`} className="space-y-1.5 px-3 py-2">
                <b>{r.name}</b>
                {canPrevious ? (
                  (r.recallSources ?? []).map((src, k) =>
                    src === 'OURS' ? null : (
                      <PreviousSchoolForm
                        key={recallIds[k]}
                        action={savePreviousSchoolAction.bind(null, slug, classId, periodId, r.studentId, recallIds[k]!)}
                        period={matrix.recallLabels[k] ?? ''}
                        current={external.get(`${r.studentId}:${recallIds[k]}`)?.average ?? null}
                        school={external.get(`${r.studentId}:${recallIds[k]}`)?.school ?? ''}
                      />
                    ),
                  )
                ) : (
                  <span className="ml-2 text-[color:var(--muted-foreground)]">
                    sans moyenne chez nous pour :{' '}
                    {(r.recallSources ?? []).map((src, k) => (src === 'OURS' ? null : matrix.recallLabels[k])).filter(Boolean).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canRetain ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Moyenne retenue par le conseil
          </h2>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Repêchage ou dérogation : la moyenne retenue remplace la moyenne calculée sur le bulletin, sans aucune
            mention, et le rang est recalculé. La moyenne calculée et le motif restent dans le journal.
          </p>
          <ul className="divide-y rounded-[--radius-card] border text-sm" style={{ borderColor: 'var(--border)' }}>
            {matrix.rows.map((r) => {
              const calc = computed.get(r.studentId) ?? null;
              const kept = retained.get(r.studentId);
              return (
                <li key={r.studentId} id={`e-${r.studentId}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <b>{r.name}</b>
                    <span className="ml-2 text-[color:var(--muted-foreground)]">
                      calculée {fmt(calc)}
                      {kept ? ` · retenue ${fmt(kept.average)} (${kept.reason})` : ''}
                    </span>
                  </span>
                  <CouncilAverageForm
                    action={setCouncilAverageAction.bind(null, slug, classId, periodId, r.studentId, calc)}
                    current={kept?.average ?? null}
                    reason={kept?.reason ?? ''}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
