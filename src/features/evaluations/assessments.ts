import 'server-only';
import { classTrack, listPeriods as listPeriodRefs } from './refs';
import { periodsForTrack } from '@/features/academic-years/periods-by-track';

import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/pagination';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission, requireWritable, requireSchoolWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { getMyTeacherId } from '@/features/teachers/my-scope';
import { coefficientFromMaxScore, splitTarget, type AssessmentInput } from './schemas';
import { GENERAL_PERMISSION, isAssessmentActionAllowed, type AssessmentAction } from './ownership';

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

export type AssessmentStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'PUBLISHED';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  OPEN: 'Prête à clôturer',
  CLOSED: 'Clôturée',
  PUBLISHED: 'Publiée',
};
export function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s;
}

/**
 * Les evaluations de l'annee, filtrees et paginees.
 *
 * Un etablissement reel en compte des milliers par an (mesure : 10 848 sur une
 * ecole de 4 000 eleves). Une lecture sans bornes s'arretait a 1 000 lignes
 * sans le dire, et le compteur de notes saisies relisait toutes les notes de
 * toutes ces evaluations — plafonne lui aussi, donc faux. Le compte vient
 * maintenant de la base, evaluation par evaluation (`grades(count)`).
 */
export async function listAssessments(
  ctx: TenantContext,
  yearId: string,
  filters: { periodId?: string; classId?: string; subjectId?: string; status?: AssessmentStatus } = {},
  range?: { from: number; to: number },
): Promise<{ rows: AssessmentRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from('assessments')
    .select(
      'id, title, assessment_date, max_score, coefficient, sequence_number, status, ' +
        'subjects(name), classes(name), groups(name), assessment_types(name), academic_periods(name), grades(count)',
      { count: 'exact' },
    )
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('assessment_date', { ascending: false })
    .order('id');
  if (filters.periodId) query = query.eq('academic_period_id', filters.periodId);
  if (filters.classId) query = query.eq('class_id', filters.classId);
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.status) query = query.eq('status', filters.status);
  if (range) query = query.range(range.from, range.to);

  const { data, error, count } = await query;
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
    groups: { name: string } | null;
    assessment_types: { name: string } | null;
    academic_periods: { name: string } | null;
    grades: { count: number }[];
  }[];

  const list = rows.map((r) => ({
    id: r.id,
    title: r.title,
    subject: r.subjects?.name ?? '—',
    // Une évaluation vise une classe OU un groupe : on montre celui des deux qui existe.
    klass: r.classes?.name ?? (r.groups ? `${r.groups.name} (groupe)` : '—'),
    type: r.assessment_types?.name ?? '—',
    period: r.academic_periods?.name ?? '—',
    assessment_date: r.assessment_date,
    max_score: r.max_score,
    coefficient: r.coefficient,
    sequence_number: r.sequence_number,
    status: r.status,
    graded: r.grades[0]?.count ?? 0,
    total: 0,
  }));

  return { rows: list, total: count ?? list.length };
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
  status: string;
  subjects: { name: string } | null;
  classes: { name: string } | null;
  groups: { name: string } | null;
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
        'grading_scale_id, assessment_date, max_score, coefficient, status, ' +
        'subjects(name), classes(name), groups(name), academic_periods(name), assessment_types(name), grading_scales(name, min_score, max_score, passing_score, decimals)',
    )
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return (data as unknown as AssessmentDetail | null) ?? null;
}

/**
 * Que puis-je faire sur cette évaluation ? Propriétaire (teacher_id = ma fiche
 * enseignant) OU détenteur de la permission générale (direction). L'enseignant ne
 * détient plus `assessments.update`, `assessments.delete` ni `grades.create`
 * (0051) : c'est la propriété qui l'autorise sur les SIENNES. La fiche enseignant
 * n'est lue que si une permission générale ne suffit pas, et une seule fois.
 */
export async function assessmentAccess(
  ctx: TenantContext,
  assessment: { teacher_id: string | null },
): Promise<Record<AssessmentAction, boolean>> {
  const actions = Object.keys(GENERAL_PERMISSION) as AssessmentAction[];
  const general = Object.fromEntries(actions.map((a) => [a, hasPermission(ctx, GENERAL_PERMISSION[a])])) as Record<AssessmentAction, boolean>;
  const needsOwnerCheck = assessment.teacher_id !== null && actions.some((a) => !general[a]);
  const myTeacherId = needsOwnerCheck ? await getMyTeacherId(ctx) : null;
  const decide = (a: AssessmentAction) =>
    isAssessmentActionAllowed({ general: general[a], assessmentTeacherId: assessment.teacher_id, myTeacherId });
  return { update: decide('update'), delete: decide('delete'), grade: decide('grade') };
}

export async function canActOnAssessment(
  ctx: TenantContext,
  assessment: { teacher_id: string | null },
  action: AssessmentAction,
): Promise<boolean> {
  return (await assessmentAccess(ctx, assessment))[action];
}

const ACTION_REFUSAL: Record<AssessmentAction, string> = {
  update: 'Vous ne pouvez modifier que vos propres évaluations.',
  delete: 'Vous ne pouvez supprimer que vos propres évaluations.',
  grade: 'Vous ne pouvez saisir des notes que dans vos propres évaluations.',
};

/** Équivalent de requireWritable pour une action sur une évaluation donnée. */
export async function requireAssessmentAccess(
  ctx: TenantContext,
  assessment: { teacher_id: string | null },
  action: AssessmentAction,
): Promise<void> {
  if (!(await canActOnAssessment(ctx, assessment, action))) throw new AuthorizationError(ACTION_REFUSAL[action]);
  requireSchoolWritable(ctx);
}

function toRow(ctx: TenantContext, yearId: string, input: AssessmentInput) {
  const { classId, groupId } = splitTarget(input.target);
  return {
    school_id: ctx.school.id,
    academic_year_id: yearId,
    academic_period_id: input.periodId,
    subject_id: input.subjectId,
    class_id: classId,
    group_id: groupId,
    teacher_id: input.teacherId ? input.teacherId : null,
    assessment_type_id: input.assessmentTypeId,
    grading_scale_id: input.gradingScaleId,
    title: input.title,
    assessment_date: input.assessmentDate,
    max_score: input.maxScore,
    // Jamais saisi : coefficient = barème / 20, recalculé ici quel que soit ce
    // qu'un client aurait pu envoyer (règle unique, appliquée partout).
    coefficient: coefficientFromMaxScore(input.maxScore),
    sequence_number: input.sequenceNumber ?? 1,
  };
}

/**
 * Une évaluation doit porter sur une période de l'ordre d'enseignement de SA
 * classe : un devoir d'une 1ère G1 (technique) se range dans un semestre, pas
 * dans un trimestre. C'est ce qui garantit qu'un bulletin ne mélange jamais
 * deux ordres — les écrans filtrent déjà, ceci ferme la porte côté serveur.
 *
 * Une évaluation de GROUPE suit l'ordre de la PREMIÈRE classe du groupe : un
 * groupe ne traverse jamais deux ordres d'enseignement dans la pratique, et
 * refuser faute de classe directe empêcherait simplement de noter un groupe.
 */
async function assertPeriodMatchesTarget(ctx: TenantContext, yearId: string, target: string, periodId: string): Promise<void> {
  const { classId, groupId } = splitTarget(target);
  if (classId) return assertPeriodMatchesClass(ctx, yearId, classId, periodId);
  if (!groupId) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from('group_classes')
    .select('class_id')
    .eq('school_id', ctx.school.id)
    .eq('group_id', groupId)
    .limit(1)
    .maybeSingle();
  if (data?.class_id) return assertPeriodMatchesClass(ctx, yearId, data.class_id, periodId);
}

async function assertPeriodMatchesClass(ctx: TenantContext, yearId: string, classId: string, periodId: string): Promise<void> {
  const [periods, track] = await Promise.all([listPeriodRefs(ctx, yearId), classTrack(ctx, classId)]);
  if (periods.length === 0) return;
  const allowed = periodsForTrack(periods, track);
  if (allowed.some((p) => p.id === periodId)) return;
  const chosen = periods.find((p) => p.id === periodId);
  throw new ValidationError(
    chosen
      ? `« ${chosen.name} » ne concerne pas cette classe : elle suit le découpage de son ordre d'enseignement.`
      : 'Cette période ne concerne pas cette classe.',
  );
}

export async function createAssessment(ctx: TenantContext, yearId: string, input: AssessmentInput): Promise<string> {
  requireWritable(ctx, 'assessments.create');
  await assertPeriodMatchesTarget(ctx, yearId, input.target, input.periodId);
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
  const supabase = await createClient();
  const existing = await getAssessment(ctx, id);
  if (!existing) throw new NotFoundError('Évaluation introuvable.');
  await requireAssessmentAccess(ctx, existing, 'update');
  if (existing.status === 'PUBLISHED') throw new ConflictError('Une évaluation publiée ne peut plus être modifiée.');
  await assertPeriodMatchesTarget(ctx, yearId, input.target, input.periodId);
  const { error } = await supabase.from('assessments').update(toRow(ctx, yearId, input)).eq('school_id', ctx.school.id).eq('id', id);
  if (error) throw error;
  await audit(ctx, { action: 'assessments.update', module: 'assessments', entityType: 'assessment', entityId: id, after: { title: input.title } });
}

export async function deleteAssessment(ctx: TenantContext, id: string): Promise<void> {
  const supabase = await createClient();
  const existing = await getAssessment(ctx, id);
  if (!existing) throw new NotFoundError('Évaluation introuvable.');
  await requireAssessmentAccess(ctx, existing, 'delete');
  if (existing.status === 'PUBLISHED') throw new ConflictError('Une évaluation publiée ne peut pas être supprimée.');
  const { error } = await supabase.from('assessments').delete().eq('school_id', ctx.school.id).eq('id', id);
  if (error) throw error;
  await audit(ctx, { action: 'assessments.delete', module: 'assessments', entityType: 'assessment', entityId: id });
}

/**
 * Les changements d'etat d'une evaluation.
 *
 * `submit` et `unsubmit` appartiennent a l'ENSEIGNANT : il declare sa saisie
 * terminee, l'administration voit alors quoi cloturer. L'etat OPEN existait
 * dans la base depuis l'origine et rien n'y menait jamais — il ne voulait rien
 * dire. Il veut maintenant dire « pret a cloturer ».
 *
 * Declarer ne verrouille pas : tant que l'evaluation n'est pas cloturee,
 * l'enseignant peut encore corriger une note. Le verrou, c'est la cloture.
 */
type Transition = 'submit' | 'unsubmit' | 'close' | 'publish' | 'reopen';
const NEXT: Record<Transition, { from: AssessmentStatus[]; to: AssessmentStatus; perm: string; audit: string }> = {
  submit: { from: ['DRAFT'], to: 'OPEN', perm: 'grades.create', audit: 'assessments.submit' },
  unsubmit: { from: ['OPEN'], to: 'DRAFT', perm: 'grades.create', audit: 'assessments.unsubmit' },
  close: { from: ['DRAFT', 'OPEN'], to: 'CLOSED', perm: 'grades.validate', audit: 'assessments.close' },
  publish: { from: ['CLOSED'], to: 'PUBLISHED', perm: 'grades.publish', audit: 'assessments.publish' },
  reopen: { from: ['CLOSED', 'PUBLISHED'], to: 'DRAFT', perm: 'grades.validate', audit: 'assessments.reopen' },
};

/**
 * Transitions de statut (DRAFT → CLOSED → PUBLISHED, plus réouverture).
 * Seules les évaluations CLOSED/PUBLISHED comptent dans les moyennes (0022) ;
 * les familles ne voient que les PUBLISHED (RLS 0021).
 */
/**
 * Cloture (ou publie) plusieurs evaluations d'un coup.
 *
 * Un enseignant ne cloture pas ses propres evaluations : c'est le geste de
 * l'administration qui fait entrer les notes dans les moyennes. Sur une ecole
 * reelle cela represente des milliers d'evaluations par periode — une par une,
 * c'etait inatteignable.
 *
 * Le filtre sur l'etat de depart fait le tri : une evaluation deja clôturee est
 * simplement ignoree, aucune erreur. La regle par ligne reste celle de la base
 * (declencheur 0059).
 */
export async function transitionMany(ctx: TenantContext, ids: string[], action: Transition): Promise<number> {
  const rule = NEXT[action];
  requireWritable(ctx, rule.perm);
  if (ids.length === 0) return 0;
  const supabase = await createClient();

  let changed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const patch: Record<string, unknown> = { status: rule.to };
    if (rule.to === 'PUBLISHED') patch.published_at = new Date().toISOString();
    if (rule.to === 'DRAFT') patch.published_at = null;
    const { error, count } = await supabase
      .from('assessments')
      .update(patch as never, { count: 'exact' })
      .eq('school_id', ctx.school.id)
      .in('status', rule.from)
      .in('id', ids.slice(i, i + 200));
    if (error) throw error;
    changed += count ?? 0;
  }

  await audit(ctx, {
    action: rule.audit,
    module: 'assessments',
    entityType: 'assessment',
    after: { status: rule.to, asked: ids.length, changed },
  });
  return changed;
}

/** Les identifiants correspondant a un filtre — pour agir sur « tout le filtre ». */
export async function assessmentIdsMatching(
  ctx: TenantContext,
  yearId: string,
  filters: { periodId?: string; classId?: string; subjectId?: string; status?: AssessmentStatus },
): Promise<string[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<{ id: string }>((cursor) => {
    let q = supabase
      .from('assessments')
      .select('id')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .order('id') // curseur : tri total requis (cf. lib/supabase/pagination)
      .limit(500);
    if (filters.periodId) q = q.eq('academic_period_id', filters.periodId);
    if (filters.classId) q = q.eq('class_id', filters.classId);
    if (filters.subjectId) q = q.eq('subject_id', filters.subjectId);
    if (filters.status) q = q.eq('status', filters.status);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;
  }, 500);
  return rows.map((r) => r.id);
}

export async function transitionAssessment(ctx: TenantContext, id: string, action: Transition): Promise<void> {
  const rule = NEXT[action];
  const supabase = await createClient();
  const existing = await getAssessment(ctx, id);
  if (!existing) throw new NotFoundError('Évaluation introuvable.');
  // Declarer sa saisie terminee est un geste de proprietaire, pas un droit
  // general : l'enseignant ne detient pas `grades.create`, il detient SON
  // evaluation.
  if (action === 'submit' || action === 'unsubmit') {
    await requireAssessmentAccess(ctx, existing, 'grade');
  } else {
    requireWritable(ctx, rule.perm);
  }
  if (!rule.from.includes(existing.status as AssessmentStatus)) {
    throw new ValidationError(`Transition impossible depuis l'état « ${statusLabel(existing.status)} ».`);
  }
  const patch: Record<string, unknown> = { status: rule.to };
  if (rule.to === 'PUBLISHED') patch.published_at = new Date().toISOString();
  if (rule.to === 'DRAFT') patch.published_at = null;
  const { error } = await supabase.from('assessments').update(patch as never).eq('school_id', ctx.school.id).eq('id', id);
  if (error) throw error;
  await audit(ctx, { action: rule.audit, module: 'assessments', entityType: 'assessment', entityId: id, after: { status: rule.to } });
}
