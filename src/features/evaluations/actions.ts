'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { gradingScaleSchema, assessmentTypeSchema, assessmentSchema } from './schemas';
import { saveScale, deleteScale, saveType, deleteType, seedDefaults } from './config';
import { createAssessment, updateAssessment, deleteAssessment, transitionAssessment } from './assessments';
import { saveGrades, type GradeEntry } from './grades';

// --- Configuration : barèmes + types -----------------------------------------

export async function seedDefaultsAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const { scale, types } = await seedDefaults(ctx);
    redirect(`/e/${slug}/evaluations/config?seeded=${scale ? 1 : 0}-${types}`);
  });
}

export async function saveScaleAction(slug: string, id: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const input = gradingScaleSchema.parse({
      code: fd.get('code'),
      name: fd.get('name'),
      kind: fd.get('kind'),
      minScore: fd.get('minScore'),
      maxScore: fd.get('maxScore'),
      passingScore: fd.get('passingScore'),
      decimals: fd.get('decimals'),
      rounding: fd.get('rounding'),
      isDefault: fd.get('isDefault') === 'on' || fd.get('isDefault') === 'true',
    });
    await saveScale(ctx, input, id ?? undefined);
    redirect(`/e/${slug}/evaluations/config?scale=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deleteScaleAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteScale(ctx, id);
    redirect(`/e/${slug}/evaluations/config?scaledel=1`);
  });
}

export async function saveTypeAction(slug: string, id: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const input = assessmentTypeSchema.parse({
      code: fd.get('code'),
      name: fd.get('name'),
      defaultCoefficient: fd.get('defaultCoefficient'),
      countsInAverage: fd.get('countsInAverage') === 'on' || fd.get('countsInAverage') === 'true',
      sequence: fd.get('sequence'),
    });
    await saveType(ctx, input, id ?? undefined);
    redirect(`/e/${slug}/evaluations/config?type=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deleteTypeAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteType(ctx, id);
    redirect(`/e/${slug}/evaluations/config?typedel=1`);
  });
}

// --- Évaluations -------------------------------------------------------------

function parseAssessment(fd: FormData) {
  return assessmentSchema.parse({
    title: fd.get('title'),
    subjectId: fd.get('subjectId'),
    classId: fd.get('classId'),
    periodId: fd.get('periodId'),
    assessmentTypeId: fd.get('assessmentTypeId'),
    gradingScaleId: fd.get('gradingScaleId'),
    teacherId: fd.get('teacherId') ?? '',
    assessmentDate: fd.get('assessmentDate'),
    maxScore: fd.get('maxScore'),
    coefficient: fd.get('coefficient'),
    isEliminatory: fd.get('isEliminatory') === 'on' || fd.get('isEliminatory') === 'true',
    eliminatoryThreshold: fd.get('eliminatoryThreshold') ?? '',
  });
}

export async function createAssessmentAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
    const id = await createAssessment(ctx, ctx.academicYear.id, parseAssessment(fd));
    redirect(`/e/${slug}/evaluations/${id}`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function updateAssessmentAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
    await updateAssessment(ctx, ctx.academicYear.id, id, parseAssessment(fd));
    redirect(`/e/${slug}/evaluations/${id}?updated=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}

export async function deleteAssessmentAction(slug: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteAssessment(ctx, id);
    redirect(`/e/${slug}/evaluations?deleted=1`);
  });
}

export async function transitionAssessmentAction(
  slug: string,
  id: string,
  action: 'close' | 'publish' | 'reopen',
  _p: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await transitionAssessment(ctx, id, action);
    redirect(`/e/${slug}/evaluations/${id}?status=1`);
  });
}

// --- Saisie des notes --------------------------------------------------------

export async function saveGradesAction(slug: string, id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const studentIds = String(fd.get('studentIds') ?? '').split(',').filter(Boolean);
    const entries: GradeEntry[] = studentIds.map((sid) => {
      const rawScore = String(fd.get(`score_${sid}`) ?? '').trim().replace(',', '.');
      const isAbsent = fd.get(`absent_${sid}`) === 'on';
      return {
        studentId: sid,
        score: !isAbsent && rawScore !== '' ? Number(rawScore) : null,
        isAbsent,
        isExcused: fd.get(`excused_${sid}`) === 'on',
        comment: String(fd.get(`comment_${sid}`) ?? '').trim(),
      };
    });
    const invalid = entries.find((e) => e.score !== null && Number.isNaN(e.score));
    if (invalid) throw new ValidationError('Une note saisie n\'est pas un nombre valide.');
    await saveGrades(ctx, id, entries);
    redirect(`/e/${slug}/evaluations/${id}?saved=1`);
  });
}
