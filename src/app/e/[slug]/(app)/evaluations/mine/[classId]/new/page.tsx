import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { getMyTaughtClasses, getMySubjectsForClass, getMyTeacherId } from '@/features/teachers/my-scope';
import { listPeriods } from '@/features/evaluations/refs';
import { listScales, listTypes } from '@/features/evaluations/config';
import { createAssessmentAction } from '@/features/evaluations/actions';
import { AssessmentForm } from '@/features/evaluations/components/AssessmentForm';
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

  const [subjects, allPeriods, types, scales, myTeacherId] = await Promise.all([
    getMySubjectsForClass(ctx, classId),
    listPeriods(ctx, yearId),
    listTypes(ctx),
    listScales(ctx),
    getMyTeacherId(ctx),
  ]);

  const periodId = typeof sp.period === 'string' ? sp.period : undefined;
  const period = periodId ? allPeriods.find((p) => p.id === periodId) : undefined;

  const missing: string[] = [];
  if (subjects.length === 0) missing.push('une discipline qui vous soit affectée dans cette classe');
  if (!period) missing.push('une période valide');
  if (scales.length === 0) missing.push('un barème (Barèmes & types)');
  if (types.length === 0) missing.push('un type d’évaluation (Barèmes & types)');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Nouvelle évaluation — ${klass.name}`}
        action={<Link href={`${base}${period ? `?period=${period.id}` : ''}`}><Button variant="ghost">Retour</Button></Link>}
      />

      {missing.length > 0 ? (
        <Alert tone="info">Impossible de créer une évaluation : {missing.join(', ')}.</Alert>
      ) : period ? (
        <AssessmentForm
          action={createAssessmentAction.bind(null, slug)}
          lockSubjectIfSingle
          refs={{
            subjects,
            classes: [{ id: klass.id, name: klass.name }],
            periods: [{ id: period.id, name: period.name }],
            types: types.map((t) => ({ id: t.id, name: t.name })),
            scales: scales.map((s) => ({ id: s.id, name: s.name })),
            // Attribue l'evaluation a l'enseignant connecte : c'est ce champ
            // (assessments.teacher_id) qui alimente ensuite « Evaluations »
            // au tableau de bord et le perimetre owns_assessment().
            teachers: myTeacherId ? [{ id: myTeacherId, name: ctx.user.displayName }] : [],
          }}
          defaults={{ classId: klass.id, periodId: period.id, ...(myTeacherId ? { teacherId: myTeacherId } : {}) }}
        />
      ) : (
        <EmptyState title="Période manquante" hint="Revenez à l'onglet de la période concernée." />
      )}
    </div>
  );
}
