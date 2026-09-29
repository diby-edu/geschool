import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { LEAVE_REASONS, type LeaveStatus } from './enrollment-changes-types';

/**
 * La vie scolaire d'un élève après son inscription : changer de classe, partir,
 * revenir l'année suivante.
 *
 * Rien de tout cela n'existait. Une erreur de classe à la saisie était
 * définitive, un élève parti restait inscrit pour toujours, et au passage à
 * l'année suivante il n'y avait aucun moyen de faire monter une classe.
 *
 * `student_transfers` existait pourtant depuis l'origine, vide : classe
 * d'origine, classe d'arrivée, date et motif. On s'en sert enfin — un
 * changement de classe laisse une trace, il ne réécrit pas l'histoire.
 */

export type EnrollmentTransfer = {
  fromClassName: string | null;
  toClassName: string | null;
  effectiveOn: string;
  reason: string | null;
};

/** Le parcours de l'élève cette année : ses changements de classe, du plus récent au plus ancien. */
export async function listTransfers(ctx: TenantContext, studentId: string, yearId: string): Promise<EnrollmentTransfer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('student_transfers')
    .select('effective_on, reason, from_class:from_class_id(name), to_class:to_class_id(name)')
    .eq('school_id', ctx.school.id)
    .eq('student_id', studentId)
    .eq('academic_year_id', yearId)
    .order('effective_on', { ascending: false });
  return ((data ?? []) as unknown as {
    effective_on: string;
    reason: string | null;
    from_class: { name: string } | null;
    to_class: { name: string } | null;
  }[]).map((t) => ({
    fromClassName: t.from_class?.name ?? null,
    toClassName: t.to_class?.name ?? null,
    effectiveOn: t.effective_on,
    reason: t.reason,
  }));
}

/**
 * Change un élève de classe, et l'écrit dans son parcours.
 *
 * Ses notes, ses absences et ses bulletins déjà pris ne bougent pas : ils sont
 * rattachés à l'élève et à la période, pas à la classe. C'est voulu — un élève
 * arrivé en cours de trimestre garde ce qu'il a fait avant.
 */
export async function transferStudent(
  ctx: TenantContext,
  input: { studentId: string; toClassId: string; effectiveOn: string; reason: string },
): Promise<void> {
  requireWritable(ctx, 'enrollments.transfer');
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
  const supabase = await createClient();
  const yearId = ctx.academicYear.id;

  const { data: enrollment } = await supabase
    .from('student_enrollments')
    .select('id, class_id, status')
    .eq('school_id', ctx.school.id)
    .eq('student_id', input.studentId)
    .eq('academic_year_id', yearId)
    .maybeSingle();
  if (!enrollment) throw new NotFoundError('Cet élève n’est pas inscrit cette année.');
  if (enrollment.status !== 'ENROLLED') throw new ConflictError('Cet élève a quitté l’établissement.');
  if (enrollment.class_id === input.toClassId) throw new ValidationError('L’élève est déjà dans cette classe.');

  const { error: trace } = await supabase.from('student_transfers').insert({
    school_id: ctx.school.id,
    student_id: input.studentId,
    academic_year_id: yearId,
    from_class_id: enrollment.class_id,
    to_class_id: input.toClassId,
    effective_on: input.effectiveOn,
    reason: input.reason || null,
    decided_by: ctx.user.id,
  });
  if (trace) throw trace;

  const { error, count } = await supabase
    .from('student_enrollments')
    .update({ class_id: input.toClassId }, { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', enrollment.id);
  if (error) throw error;
  if (!count) {
    throw new ConflictError(
      'Le changement a été enregistré, mais la classe n’a pas pu être modifiée : il vous manque le droit de valider une inscription.',
    );
  }

  // Les groupes suivent la classe : un élève qui quitte la 4ème 1 n'a plus sa
  // place dans un groupe qui ne tire ses élèves que de cette classe.
  await pruneGroups(ctx, input.studentId, yearId, input.toClassId);

  await audit(ctx, {
    action: 'enrollments.transfer',
    module: 'students',
    entityType: 'student',
    entityId: input.studentId,
    before: { classId: enrollment.class_id },
    after: { classId: input.toClassId, effectiveOn: input.effectiveOn, reason: input.reason },
  });
}

/** Retire l'élève des groupes que sa nouvelle classe n'alimente pas. */
async function pruneGroups(ctx: TenantContext, studentId: string, yearId: string, classId: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('student_groups')
    .select('id, group_id, groups(group_classes(class_id))')
    .eq('school_id', ctx.school.id)
    .eq('student_id', studentId)
    .eq('academic_year_id', yearId)
    .is('left_at', null);
  const rows = (data ?? []) as unknown as {
    id: string;
    group_id: string;
    groups: { group_classes: { class_id: string }[] } | null;
  }[];
  const stale = rows
    .filter((r) => !(r.groups?.group_classes ?? []).some((c) => c.class_id === classId))
    .map((r) => r.id);
  if (stale.length === 0) return;
  await supabase.from('student_groups').delete().eq('school_id', ctx.school.id).in('id', stale);
}

/**
 * L'élève quitte l'établissement : transféré, retiré, ou scolarité achevée.
 *
 * L'inscription n'est jamais effacée — elle porte les notes et les absences de
 * l'année. Elle change d'état, avec une date et un motif.
 */
export async function withdrawStudent(
  ctx: TenantContext,
  input: { studentId: string; status: LeaveStatus; leftOn: string; reason: string },
): Promise<void> {
  requireWritable(ctx, 'enrollments.withdraw');
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
  const supabase = await createClient();

  const { error, count } = await supabase
    .from('student_enrollments')
    .update(
      { status: input.status, left_on: input.leftOn, left_reason: input.reason || null },
      { count: 'exact' },
    )
    .eq('school_id', ctx.school.id)
    .eq('student_id', input.studentId)
    .eq('academic_year_id', ctx.academicYear.id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Cet élève n’est pas inscrit cette année.');

  await audit(ctx, {
    action: 'enrollments.withdraw',
    module: 'students',
    entityType: 'student',
    entityId: input.studentId,
    after: { status: input.status, leftOn: input.leftOn, reason: LEAVE_REASONS[input.status] },
  });
}

/** Annule un départ : l'élève reprend sa place dans sa classe. */
export async function reinstateStudent(ctx: TenantContext, studentId: string): Promise<void> {
  requireWritable(ctx, 'enrollments.withdraw');
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('student_enrollments')
    .update({ status: 'ENROLLED', left_on: null, left_reason: null }, { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('student_id', studentId)
    .eq('academic_year_id', ctx.academicYear.id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Cet élève n’est pas inscrit cette année.');
  await audit(ctx, {
    action: 'enrollments.transfer',
    module: 'students',
    entityType: 'student',
    entityId: studentId,
    after: { status: 'ENROLLED', reinstated: true },
  });
}
