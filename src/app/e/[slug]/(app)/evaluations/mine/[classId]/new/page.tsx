import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { getMyTaughtClasses, getMySubjectsForClass, getMyTeacherId } from '@/features/teachers/my-scope';
import { listPeriods } from '@/features/evaluations/refs';
import { listScales, listTypes, getDefaultScale } from '@/features/evaluations/config';
import { countAssessments } from '@/features/evaluations/assessments';
import { createAssessmentAction } from '@/features/evaluations/actions';
import { SimpleAssessmentForm } from '@/features/evaluations/components/SimpleAssessmentForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Nouvelle évaluation' };

export default async function NewMyAssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; classId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, classId } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  if (!ctx.academicYear) notFound();
  const yearId = ctx.academicYear.id;
  const base = `/e/${slug}/evaluations/mine/${classId}`;

  const classes = await getMyTaughtClasses(ctx);
  const klass = classes.find((c) => c.id === classId);
  if (!klass) notFound();

  const [subjects, allPeriods, types, scales, defaultScale, myTeacherId] = await Promise.all([
    getMySubjectsForClass(ctx, classId),
    listPeriods(ctx, yearId),
    listTypes(ctx),
    listScales(ctx),
    getDefaultScale(ctx),
    getMyTeacherId(ctx),
  ]);
  // Barème résolu automatiquement (pas de champ dans ce formulaire réduit) :
  // celui marqué par défaut, sinon le premier existant.
  const gradingScaleId = defaultScale?.id ?? scales[0]?.id;

  const periodId = typeof sp.period === 'string' ? sp.period : undefined;
  const period = periodId ? allPeriods.find((p) => p.id === periodId) : undefined;

  const missing: string[] = [];
  if (subjects.length === 0) missing.push('une discipline qui vous soit affectée dans cette classe');
  if (!period) missing.push('une période valide');
  if (scales.length === 0) missing.push('un barème (Barèmes & types)');
  if (types.length === 0) missing.push('un type d’évaluation (Barèmes & types)');

  // Numéro suggéré : seulement calculable quand la matière est déjà connue
  // (cas courant, un seul enseignement dans cette classe) — avec plusieurs
  // matières, le numéro dépend d'un choix pas encore fait par l'enseignant.
  const nextNumber =
    period && subjects.length === 1
      ? (await countAssessments(ctx, yearId, { classId, periodId: period.id, subjectId: subjects[0]!.id })) + 1
      : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Nouvelle évaluation — ${klass.name}`}
        action={<Link href={`${base}${period ? `?period=${period.id}` : ''}`}><Button variant="ghost">Retour</Button></Link>}
      />

      {missing.length > 0 ? (
        <Alert tone="info">Impossible de créer une évaluation : {missing.join(', ')}.</Alert>
      ) : period && gradingScaleId ? (
        <SimpleAssessmentForm
          action={createAssessmentAction.bind(null, slug)}
          subjects={subjects}
          types={types.map((t) => ({ id: t.id, name: t.name }))}
          classId={klass.id}
          periodId={period.id}
          gradingScaleId={gradingScaleId}
          {...(myTeacherId ? { teacherId: myTeacherId } : {})}
          {...(nextNumber ? { nextNumber } : {})}
        />
      ) : (
        <EmptyState title="Période manquante" hint="Revenez à l'onglet de la période concernée." />
      )}
    </div>
  );
}
