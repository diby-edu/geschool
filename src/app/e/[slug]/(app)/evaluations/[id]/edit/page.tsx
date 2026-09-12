import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { getAssessment } from '@/features/evaluations/assessments';
import { listPeriods, listClasses, listSubjects, listTeachers } from '@/features/evaluations/refs';
import { listScales, listTypes } from '@/features/evaluations/config';
import { updateAssessmentAction } from '@/features/evaluations/actions';
import { AssessmentForm } from '@/features/evaluations/components/AssessmentForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Modifier l’évaluation' };

export default async function EditAssessmentPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'assessments.update');
  const base = `/e/${slug}/evaluations`;

  const a = await getAssessment(ctx, id);
  if (!a || !ctx.academicYear) notFound();
  const yearId = ctx.academicYear.id;

  const [subjects, classes, periods, types, scales, teachers] = await Promise.all([
    listSubjects(ctx),
    listClasses(ctx, yearId),
    listPeriods(ctx, yearId),
    listTypes(ctx),
    listScales(ctx),
    listTeachers(ctx),
  ]);

  const rec = a as unknown as {
    title: string;
    subject_id: string;
    class_id: string | null;
    academic_period_id: string;
    assessment_type_id: string;
    grading_scale_id: string;
    teacher_id: string | null;
    assessment_date: string;
    max_score: number;
    coefficient: number;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Modifier l’évaluation" action={<Link href={`${base}/${id}`}><Button variant="ghost">Retour</Button></Link>} />
      <AssessmentForm
        action={updateAssessmentAction.bind(null, slug, id)}
        submitLabel="Enregistrer"
        refs={{
          subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
          classes,
          periods,
          types: types.map((t) => ({ id: t.id, name: t.name })),
          scales: scales.map((s) => ({ id: s.id, name: s.name })),
          teachers,
        }}
        defaults={{
          title: rec.title,
          subjectId: rec.subject_id,
          classId: rec.class_id ?? '',
          periodId: rec.academic_period_id,
          assessmentTypeId: rec.assessment_type_id,
          gradingScaleId: rec.grading_scale_id,
          teacherId: rec.teacher_id ?? '',
          assessmentDate: rec.assessment_date,
          maxScore: rec.max_score,
          coefficient: rec.coefficient,
        }}
      />
    </div>
  );
}
