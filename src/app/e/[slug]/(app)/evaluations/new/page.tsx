import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listPeriods, listClasses, listSubjects, listTeachers } from '@/features/evaluations/refs';
import { listScales, listTypes } from '@/features/evaluations/config';
import { createAssessmentAction } from '@/features/evaluations/actions';
import { AssessmentForm } from '@/features/evaluations/components/AssessmentForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Nouvelle évaluation' };

export default async function NewAssessmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'assessments.create');
  const base = `/e/${slug}/evaluations`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Nouvelle évaluation" />
        <EmptyState title="Aucune année active" hint="Activez une année scolaire d'abord." />
      </div>
    );
  }
  const yearId = ctx.academicYear.id;

  const [subjects, classes, periods, types, scales, teachers] = await Promise.all([
    listSubjects(ctx),
    listClasses(ctx, yearId),
    listPeriods(ctx, yearId),
    listTypes(ctx),
    listScales(ctx),
    listTeachers(ctx),
  ]);

  const missing: string[] = [];
  if (periods.length === 0) missing.push('une période de notation (Années scolaires → périodes)');
  if (scales.length === 0) missing.push('un barème (Barèmes & types)');
  if (types.length === 0) missing.push('un type d’évaluation (Barèmes & types)');
  if (classes.length === 0) missing.push('une classe');
  if (subjects.length === 0) missing.push('une matière');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Nouvelle évaluation"
        action={<Link href={base}><Button variant="ghost">Retour</Button></Link>}
      />

      {missing.length > 0 ? (
        <Alert tone="info">
          Avant de créer une évaluation, configurez : {missing.join(', ')}.
        </Alert>
      ) : (
        <AssessmentForm
          action={createAssessmentAction.bind(null, slug)}
          refs={{
            subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
            classes,
            periods,
            types: types.map((t) => ({ id: t.id, name: t.name })),
            scales: scales.map((s) => ({ id: s.id, name: s.name })),
            teachers,
          }}
        />
      )}
    </div>
  );
}
