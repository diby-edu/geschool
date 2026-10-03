import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { assessmentAccess, getAssessment, statusLabel } from '@/features/evaluations/assessments';
import { loadGradeGrid } from '@/features/evaluations/grades';
import {
  saveGradesAction,
  transitionAssessmentAction,
  deleteAssessmentAction,
} from '@/features/evaluations/actions';
import { GradeGrid } from '@/features/evaluations/components/GradeGrid';
import { RequestCorrections } from '@/features/evaluations/components/RequestCorrections';
import { requestCorrectionAction } from '@/features/evaluations/correction-actions';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Évaluation' };

export default async function AssessmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'assessments.view');
  requireFeature(ctx, 'grades');
  const base = `/e/${slug}/evaluations`;

  const a = await getAssessment(ctx, id);
  if (!a) notFound();

  const rel = a as unknown as {
    title: string;
    status: string;
    assessment_date: string;
    max_score: number;
    coefficient: number;
    subjects: { name: string } | null;
    classes: { name: string } | null;
    groups: { name: string } | null;
    academic_periods: { name: string } | null;
    assessment_types: { name: string } | null;
    grading_scales: { name: string } | null;
  };

  const grid = await loadGradeGrid(ctx, id);
  // Modifier / supprimer / noter : propriétaire de l'évaluation OU permission générale
  // (l'enseignant n'a plus de droit général sur celles d'un collègue, 0051).
  const access = await assessmentAccess(ctx, a);
  const canEnter = access.grade || hasPermission(ctx, 'grades.update');
  const canValidate = hasPermission(ctx, 'grades.validate');
  const canPublish = hasPermission(ctx, 'grades.publish');
  const canEdit = access.update;
  // Après clôture, la note ne se change plus directement : on la demande.
  const canAskCorrection =
    hasPermission(ctx, 'grades.request_change') && (rel.status === 'CLOSED' || rel.status === 'PUBLISHED');
  // Déclarer sa saisie terminée : geste du propriétaire de l'évaluation.
  const canGrade = access.grade;
  const canDelete = access.delete;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Flash searchParams={sp} />
      {sp.saved === '1' ? <Alert tone="success">Notes enregistrées.</Alert> : null}
      {sp.status === '1' ? <Alert tone="success">Statut mis à jour.</Alert> : null}
      {sp.updated === '1' ? <Alert tone="success">Évaluation mise à jour.</Alert> : null}

      <PageHeader
        title={rel.title}
        description={`${rel.classes?.name ?? (rel.groups ? `${rel.groups.name} (groupe)` : '—')} · ${rel.subjects?.name ?? '—'} · ${rel.academic_periods?.name ?? '—'}`}
        action={<Link href={base}><Button variant="ghost">Retour</Button></Link>}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[color:var(--muted-foreground)]">
            <span>Type : <strong className="text-[color:var(--foreground)]">{rel.assessment_types?.name ?? '—'}</strong></span>
            <span>Barème : <strong className="text-[color:var(--foreground)]">{rel.grading_scales?.name ?? '—'} (/{rel.max_score})</strong></span>
            <span>Coefficient : <strong className="text-[color:var(--foreground)]">{rel.coefficient}</strong></span>
            <span>Date : <strong className="text-[color:var(--foreground)]">{rel.assessment_date}</strong></span>
            {/* Brouillon est l'etat par defaut (avant toute action admin) : le
                signaler n'apporte rien, seuls les etats qui resultent d'une
                action reelle (cloture, publication) sont montres. */}
            {rel.status !== 'DRAFT' ? <span>État : <strong className="text-[color:var(--foreground)]">{statusLabel(rel.status)}</strong></span> : null}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && rel.status !== 'PUBLISHED' ? (
              <Link href={`${base}/${id}/edit`}><Button variant="secondary" size="sm">Modifier</Button></Link>
            ) : null}
            {canGrade && rel.status === 'DRAFT' ? (
              <SimpleSubmit
                action={transitionAssessmentAction.bind(null, slug, id, 'submit')}
                label="J’ai fini la saisie"
                small
              />
            ) : null}
            {canGrade && rel.status === 'OPEN' ? (
              <SimpleSubmit
                action={transitionAssessmentAction.bind(null, slug, id, 'unsubmit')}
                label="Reprendre la saisie"
                small
              />
            ) : null}
            {canValidate && (rel.status === 'DRAFT' || rel.status === 'OPEN') ? (
              <SimpleSubmit action={transitionAssessmentAction.bind(null, slug, id, 'close')} label="Clôturer" small />
            ) : null}
            {canPublish && rel.status === 'CLOSED' ? (
              <SimpleSubmit action={transitionAssessmentAction.bind(null, slug, id, 'publish')} label="Publier" small />
            ) : null}
            {canValidate && (rel.status === 'CLOSED' || rel.status === 'PUBLISHED') ? (
              <SimpleSubmit action={transitionAssessmentAction.bind(null, slug, id, 'reopen')} label="Rouvrir" small />
            ) : null}
            {canDelete && rel.status !== 'PUBLISHED' ? (
              <ConfirmSubmit
                action={deleteAssessmentAction.bind(null, slug, id)}
                label="Supprimer"
                variant="secondary"
                confirmMessage={`Supprimer l'évaluation « ${rel.title} » ?`}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Saisie des notes
        </h2>
        {canEnter ? (
          <GradeGrid
            action={saveGradesAction.bind(null, slug, id)}
            maxScore={grid.maxScore}
            editable={grid.editable && canEnter}
            students={grid.students}
          />
        ) : (
          <Alert tone="info">Vous n’avez pas le droit de saisir des notes.</Alert>
        )}
      </section>

      {canAskCorrection ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Demander une correction
          </h2>
          <RequestCorrections
            students={grid.students}
            maxScore={grid.maxScore}
            action={requestCorrectionAction.bind(null, slug)}
          />
        </section>
      ) : null}
    </div>
  );
}
