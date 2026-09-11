import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { AssignmentInput } from './schemas';

export async function createAssignment(ctx: TenantContext, input: AssignmentInput): Promise<void> {
  requireWritable(ctx, 'assignments.manage');
  if (!ctx.academicYear) throw new ValidationError("Activez une annee scolaire d'abord.");
  const supabase = await createClient();

  const { error } = await supabase.from('teaching_assignments').insert({
    school_id: ctx.school.id,
    academic_year_id: ctx.academicYear.id,
    teacher_id: input.teacherId,
    subject_id: input.subjectId,
    class_id: input.classId,
    weekly_minutes: input.weeklyMinutes,
    status: 'ACTIVE',
  });
  if (error) {
    if (error.code === '23505') {
      throw new ConflictError('Cet enseignant est deja affecte a cette matiere pour cette classe.');
    }
    throw error;
  }
  await audit(ctx, { action: 'assignments.create', module: 'assignments', entityType: 'teaching_assignment', after: input });
}

export async function deleteAssignment(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'assignments.manage');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('teaching_assignments')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new ConflictError('Cette affectation est utilisee (exigence ou emploi du temps).');
    }
    throw error;
  }
  if (!count) throw new NotFoundError('Affectation introuvable.');
  await audit(ctx, { action: 'assignments.delete', module: 'assignments', entityType: 'teaching_assignment', entityId: id });
}
