'use server';

import { redirect } from 'next/navigation';
import { getTenantContext, type TenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { uniqueCode } from './code';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { gradingScaleSchema, assessmentTypeSchema, assessmentSchema } from './schemas';
import { saveScale, deleteScale, saveType, deleteType, seedDefaults } from './config';
import {
  createAssessment,
  updateAssessment,
  deleteAssessment,
  transitionAssessment,
  transitionMany,
  assessmentIdsMatching,
  type AssessmentStatus,
} from './assessments';
import { saveGrades, type GradeEntry } from './grades';
import { writeSettings } from '@/features/settings/school-settings';
import { readOptionalMode } from './optional-mode';

// --- Configuration : barèmes + types -----------------------------------------

export async function seedDefaultsAction(slug: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const { scale, types } = await seedDefaults(ctx);
    redirect(`/e/${slug}/evaluations/config?seeded=${scale ? 1 : 0}-${types}`);
  });
}

/**
 * Clôturer (ou publier) plusieurs évaluations : celles cochées, ou toutes
 * celles que le filtre affiché désigne.
 */
export async function bulkTransitionAction(
  slug: string,
  action: 'close' | 'publish',
  scope: 'selection' | 'filter',
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
    const str = (k: string): string | undefined => {
      const v = String(fd.get(k) ?? '').trim();
      return v === '' ? undefined : v;
    };

    const ids =
      scope === 'filter'
        ? await assessmentIdsMatching(ctx, ctx.academicYear.id, {
            ...(str('periodId') ? { periodId: str('periodId')! } : {}),
            ...(str('classId') ? { classId: str('classId')! } : {}),
            ...(str('subjectId') ? { subjectId: str('subjectId')! } : {}),
            ...(str('status') ? { status: str('status') as AssessmentStatus } : {}),
          })
        : fd.getAll('ids').map(String).filter(Boolean);

    if (ids.length === 0) throw new ValidationError('Aucune évaluation sélectionnée.');
    const changed = await transitionMany(ctx, ids, action);
    const back = String(fd.get('back') ?? `/e/${slug}/evaluations`);
    const sep = back.includes('?') ? '&' : '?';
    redirect(`${back}${sep}lot=${changed}`);
  });
}

/** Règles de calcul : ce qui compte dans une moyenne (notes en brouillon, absences). */
export async function saveGradingPolicyAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const on = (k: string): boolean => fd.get(k) === 'on' || fd.get(k) === 'true';
    await writeSettings(ctx, 'grading', {
      absentCountsAsZero: on('absentCountsAsZero'),
      countDraftGrades: on('countDraftGrades'),
      optionalMode: readOptionalMode(fd.get('optionalMode')),
    });
    redirect(`/e/${slug}/evaluations/config?regle=1`);
  });
}

export async function saveScaleAction(slug: string, id: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const input = gradingScaleSchema.parse({
      code: await repere(ctx, fd, id, 'grading_scales'),
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
      code: await repere(ctx, fd, id, 'assessment_types'),
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
    target: fd.get('target'),
    periodId: fd.get('periodId'),
    assessmentTypeId: fd.get('assessmentTypeId'),
    gradingScaleId: fd.get('gradingScaleId'),
    teacherId: fd.get('teacherId') ?? '',
    assessmentDate: fd.get('assessmentDate'),
    maxScore: fd.get('maxScore'),
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
  action: 'submit' | 'unsubmit' | 'close' | 'publish' | 'reopen',
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

/**
 * Le repere interne d'un bareme ou d'un type.
 *
 * On ne le demande plus a l'ecole : « Code » ne veut rien dire pour qui
 * voulait simplement ecrire « Notes sur 20 ». Il se deduit du nom, et change
 * de suffixe s'il est deja pris. Une modification garde le sien : le changer
 * casserait les references existantes.
 */
async function repere(
  ctx: TenantContext,
  fd: FormData,
  id: string | null,
  table: 'grading_scales' | 'assessment_types',
): Promise<string> {
  const saisi = String(fd.get('code') ?? '').trim();
  if (saisi) return saisi;

  const supabase = await createClient();
  const { data } = await supabase.from(table).select('id, code').eq('school_id', ctx.school.id);
  const lignes = (data ?? []) as { id: string; code: string }[];
  if (id) {
    const actuel = lignes.find((l) => l.id === id)?.code;
    if (actuel) return actuel;
  }
  return uniqueCode(String(fd.get('name') ?? ''), lignes.map((l) => l.code));
}
