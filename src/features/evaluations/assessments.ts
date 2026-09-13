import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { coefficientFromMaxScore, type AssessmentInput } from './schemas';

export type AssessmentRow = {
  id: string;
  title: string;
  subject: string;
  klass: string;
  type: string;
  period: string;
  assessment_date: string;
  max_score: number;
  coefficient: number;
  sequence_number: number;
  status: string;
  graded: number;
  total: number;
};

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Brouillon', OPEN: 'Ouverte', CLOSED: 'Clôturée', PUBLISHED: 'Publiée' };
export function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s;
}

export async function listAssessments(
  ctx: TenantContext,
  yearId: string,
  filters: { periodId?: string; classId?: string; subjectId?: string } = {},
): Promise<AssessmentRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('assessments')
    .select(
      'id, title, assessment_date, max_score, coefficient, sequence_number, status, ' +
        'subjects(name), classes(name), assessment_types(name), academic_periods(name)',
    )
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('assessment_date', { ascending: false });
  if (filters.periodId) query = query.eq('academic_period_id', filters.periodId);
  if (filters.classId) query = query.eq('class_id', filters.classId);
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    title: string;
    assessment_date: string;
    max_score: number;
    coefficient: number;
    sequence_number: number;
    status: string;
    subjects: { name: string } | null;
    classes: { name: string } | null;
    assessment_types: { name: string } | null;
    academic_periods: { name: string } | null;
  }[];

  // Compteur de notes saisies par évaluation (une requête agrégée).
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: gradeRows } = await supabase
      .from('grades')
      .select('assessment_id')
      .eq('school_id', ctx.school.id)
      .in('assessment_id', ids);
    for (const g of gradeRows ?? []) counts.set(g.assessment_id, (counts.get(g.assessment_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subject: r.subjects?.name ?? '—',
    klass: r.classes?.name ?? '—',
    type: r.assessment_types?.name ?? '—',
    period: r.academic_periods?.name ?? '—',
    assessment_date: r.assessment_date,
    max_score: r.max_score,
    coefficient: r.coefficient,
    sequence_number: r.sequence_number,
    status: r.status,
    graded: counts.get(r.id) ?? 0,
    total: 0,
  }));
}

/**
 * Numéros déjà pris dans ce périmètre (matière + classe + période), par type
 * d'évaluation — sert au formulaire simplifié du tableau de bord enseignant
 * pour proposer « Évaluation n° » sans jamais reproposer un numéro déjà
 * utilisé pour le même type (§ decision : liste deroulante, pas un simple
 * compteur).
 */
export async function getUsedSequenceNumbers(
  ctx: TenantContext,
  yearId: string,
  filters: { classId: string; periodId: string; subjectId: string },
): Promise<Record<string, number[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('assessments')
    .select('assessment_type_id, sequence_number')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('class_id', filters.classId)
    .eq('academic_period_id', filters.periodId)
    .eq('subject_id', filters.subjectId);
  if (error) throw error;

  const byType: Record<string, number[]> = {};
  for (const row of data ?? []) {
    (byType[row.assessment_type_id] ??= []).push(row.sequence_number);
  }
  return byType;
}

export type AssessmentDetail = {
  id: string;
  title: string;
  subject_id: string;
  class_id: string | null;
  group_id: string | null;
  teacher_id: string | null;
  assessment_type_id: string;
  academic_period_id: string;
  grading_scale_id: string;
  assessment_date: string;
  max_score: number;
  coefficient: number;
  is_eliminatory: boolean;
  eliminatory_threshold: number | null;
  status: string;
  subjects: { name: string } | null;
  classes: { name: string } | null;
  academic_periods: { name: string } | null;
  assessment_types: { name: string } | null;
  grading_scales: { name: string; min_score: number; max_score: number; passing_score: number; decimals: number } | null;
};

export async function getAssessment(ctx: TenantContext, id: string): Promise<AssessmentDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessments')
    .select(
      'id, title, subject_id, class_id, group_id, teacher_id, assessment_type_id, academic_period_id, ' +
        'grading_scale_id, assessment_date, max_score, coefficient, is_eliminatory, eliminatory_threshold, status, ' +
        'subjects(name), classes(name), academic_periods(name), assessment_types(name), grading_scales(name, min_score, max_score, passing_score, decimals)',
    )
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return (data as unknown as AssessmentDetail | null) ?? null;
}

function toRow(ctx: TenantContext, yearId: string, input: AssessmentInput) {
  return {
    school_id: ctx.school.id,
    academic_year_id: yearId,
    academic_period_id: input.periodId,
    subject_id: input.subjectId,
    class_id: input.classId,
    teacher_id: input.teacherId ? input.teacherId : null,
    assessment_type_id: input.assessmentTypeId,
    grading_scale_id: input.gradingScaleId,
    title: input.title,
    assessment_date: input.assessmentDate,
    max_score: input.maxScore,
    // Jamais saisi : coefficient = barème / 20, recalculé ici quel que soit ce
    // qu'un client aurait pu envoyer (règle unique, appliquée partout).
    coefficient: coefficientFromMaxScore(input.maxScore),
    is_eliminatory: input.isEliminatory,
    eliminatory_threshold: input.isEliminatory && input.eliminatoryThreshold !== '' ? Number(input.eliminatoryThreshold) : null,
    sequence_number: input.sequenceNumber ?? 1,
  };
}

export async function createAssessment(ctx: TenantContext, yearId: string, input: AssessmentInput): Promise<string> {
  requireWritable(ctx, 'assessments.create');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('assessments')
    .insert({ ...toRow(ctx, yearId, input), status: 'DRAFT', created_by: ctx.user.id })
    .select('id')
    .single();
  if (error) throw error;
  await audit(ctx, { action: 'assessments.create', module: 'assessments', entityType: 'assessment', entityId: data.id, after: { title: input.title } });
  return data.id;
}

export async function updateAssessment(ctx: TenantContext, yearId: string, id: string, input: AssessmentInput): Promise<void> {
  requireWritable(ctx, 'assessments.update');
  const supabase = await createClient();
  const existing = await getAssessment(ctx, id);
  if (!existing) throw new NotFoundError('Évaluation introuvable.');
  if (existing.status === 'PUBLISHED') throw new ConflictError('Une évaluation publiée ne peut plus être modifiée.');
  const { error } = await supabase.from('assessments').update(toRow(ctx, yearId, input)).eq('school_id', ctx.school.id).eq('id', id);
  if (error) throw error;
  await audit(ctx, { action: 'assessments.update', module: 'assessments', entityType: 'assessment', entityId: id, after: { title: input.title } });
}

export async function deleteAssessment(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'assessments.delete');
  const supabase = await createClient();
  const existing = await getAssessment(ctx, id);
  if (!existing) throw new NotFoundError('Évaluation introuvable.');
  if (existing.status === 'PUBLISHED') throw new ConflictError('Une évaluation publiée ne peut pas être supprimée.');
  const { error } = await supabase.from('assessments').delete().eq('school_id', ctx.school.id).eq('id', id);
  if (error) throw error;
  await audit(ctx, { action: 'assessments.delete', module: 'assessments', entityType: 'assessment', entityId: id });
}

type Transition = 'close' | 'publish' | 'reopen';
const NEXT: Record<Transition, { from: string[]; to: string; perm: string; audit: string }> = {
  close: { from: ['DRAFT', 'OPEN'], to: 'CLOSED', perm: 'grades.validate', audit: 'assessments.close' },
  publish: { from: ['CLOSED'], to: 'PUBLISHED', perm: 'grades.publish', audit: 'assessments.publish' },
  reopen: { from: ['CLOSED', 'PUBLISHED'], to: 'DRAFT', perm: 'grades.validate', audit: 'assessments.reopen' },
};

/**
 * Transitions de statut (DRAFT → CLOSED → PUBLISHED, plus réouverture).
 * Seules les évaluations CLOSED/PUBLISHED comptent dans les moyennes (0022) ;
 * les familles ne voient que les PUBLISHED (RLS 0021).
 */
export async function transitionAssessment(ctx: TenantContext, id: string, action: Transition): Promise<void> {
  const rule = NEXT[action];
  requireWritable(ctx, rule.perm);
  const supabase = await createClient();
  const existing = await getAssessment(ctx, id);
  if (!existing) throw new NotFoundError('Évaluation introuvable.');
  if (!rule.from.includes(existing.status)) {
    throw new ValidationError(`Transition impossible depuis l'état « ${statusLabel(existing.status)} ».`);
  }
  const patch: Record<string, unknown> = { status: rule.to };
  if (rule.to === 'PUBLISHED') patch.published_at = new Date().toISOString();
  if (rule.to === 'DRAFT') patch.published_at = null;
  const { error } = await supabase.from('assessments').update(patch as never).eq('school_id', ctx.school.id).eq('id', id);
  if (error) throw error;
  await audit(ctx, { action: rule.audit, module: 'assessments', entityType: 'assessment', entityId: id, after: { status: rule.to } });
}
