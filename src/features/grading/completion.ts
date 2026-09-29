import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';
import { AuthorizationError, NotFoundError } from '@/lib/errors';
import { gradingState } from '@/features/academic-years/grading';
import { schoolToday } from '@/features/dashboard/time';

/**
 * « J'ai terminé mes moyennes » : l'enseignant le marque par classe et par matière,
 * pendant la période de calcul ouverte par la direction (migration 0056). La base
 * applique les règles (propriétaire de l'affectation, fenêtre ouverte) : ce module
 * les explique, il ne les remplace pas.
 */

export type CompletionState = {
  /** Affectation (enseignant + classe + matière) concernée ; null si l'enseignant n'enseigne pas cette matière ici. */
  assignmentId: string | null;
  completed: boolean;
  completedAt: string | null;
  /** La fenêtre de calcul est-elle ouverte aujourd'hui ? */
  open: boolean;
  /** Dates configurées par la direction (affichage). */
  window: { starts: string | null; ends: string | null; manual: boolean };
  /** La migration 0056 n'est pas appliquée : la fonction n'existe pas encore. */
  unavailable: boolean;
};

async function findAssignment(ctx: TenantContext, classId: string, subjectId: string, periodId: string): Promise<string | null> {
  if (!ctx.academicYear) return null;
  const supabase = await createClient();
  const { data: teacher } = await supabase
    .from('teachers')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('user_id', ctx.user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!teacher) return null;
  const { data } = await supabase
    .from('teaching_assignments')
    .select('id, academic_period_id')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', ctx.academicYear.id)
    .eq('teacher_id', teacher.id)
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('status', 'ACTIVE');
  const rows = (data ?? []) as { id: string; academic_period_id: string | null }[];
  // Une affectation propre à la période prime sur celle de toute l'année.
  return (rows.find((r) => r.academic_period_id === periodId) ?? rows.find((r) => r.academic_period_id === null))?.id ?? null;
}

export async function getCompletionState(ctx: TenantContext, classId: string, subjectId: string, periodId: string): Promise<CompletionState> {
  const supabase = await createClient();
  const assignmentId = await findAssignment(ctx, classId, subjectId, periodId);
  const empty: CompletionState = { assignmentId, completed: false, completedAt: null, open: false, window: { starts: null, ends: null, manual: false }, unavailable: false };

  const { data: period, error } = await supabase
    .from('academic_periods')
    .select('grading_starts_on, grading_ends_on, grading_override')
    .eq('school_id', ctx.school.id)
    .eq('id', periodId)
    .maybeSingle();
  if (error) return { ...empty, unavailable: true };
  if (!period) return empty;

  const state = gradingState(period, schoolToday(ctx.school.timezone));
  let completedAt: string | null = null;
  if (assignmentId) {
    const { data } = await supabase
      .from('average_completions')
      .select('completed_at')
      .eq('teaching_assignment_id', assignmentId)
      .eq('academic_period_id', periodId)
      .maybeSingle();
    completedAt = (data as { completed_at: string } | null)?.completed_at ?? null;
  }
  return {
    assignmentId,
    completed: completedAt !== null,
    completedAt,
    open: state.open,
    window: { starts: period.grading_starts_on, ends: period.grading_ends_on, manual: period.grading_override !== null },
    unavailable: false,
  };
}

export async function markAveragesComplete(ctx: TenantContext, classId: string, subjectId: string, periodId: string): Promise<void> {
  const assignmentId = await findAssignment(ctx, classId, subjectId, periodId);
  if (!assignmentId) throw new NotFoundError('Cette matière ne vous est pas affectée dans cette classe.');
  const supabase = await createClient();
  const { error } = await supabase.from('average_completions').insert({
    school_id: ctx.school.id,
    academic_period_id: periodId,
    teaching_assignment_id: assignmentId,
    completed_by: ctx.user.id,
  });
  if (error) {
    if (error.code === '23505') return; // déjà marquées : idempotent
    if (error.code === '42501') throw new AuthorizationError('La période de calcul des moyennes est fermée.');
    throw error;
  }
  await audit(ctx, { action: 'grading.complete', module: 'grading', entityType: 'teaching_assignment', entityId: assignmentId, after: { periodId } });
}

export async function reopenAverages(ctx: TenantContext, classId: string, subjectId: string, periodId: string): Promise<void> {
  const assignmentId = await findAssignment(ctx, classId, subjectId, periodId);
  if (!assignmentId) throw new NotFoundError('Cette matière ne vous est pas affectée dans cette classe.');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('average_completions')
    .delete({ count: 'exact' })
    .eq('teaching_assignment_id', assignmentId)
    .eq('academic_period_id', periodId);
  if (error) throw error;
  // La base ne signale pas un refus de suppression : 0 ligne = fenêtre fermée ou rien à rouvrir.
  if (!count) throw new AuthorizationError('Impossible de rouvrir : la période de calcul est fermée.');
  await audit(ctx, { action: 'grading.reopen', module: 'grading', entityType: 'teaching_assignment', entityId: assignmentId, after: { periodId } });
}
