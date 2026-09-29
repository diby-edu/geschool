import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { AssignmentInput, GroupAssignmentInput } from './schemas';

export async function createAssignment(ctx: TenantContext, input: AssignmentInput): Promise<void> {
  requireWritable(ctx, 'assignments.manage');
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
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
      throw new ConflictError('Cet enseignant est déjà affecté à cette matière pour cette classe.');
    }
    throw error;
  }
  await audit(ctx, { action: 'assignments.create', module: 'assignments', entityType: 'teaching_assignment', after: input });
}

/**
 * Confie un groupe a un enseignant.
 *
 * Meme table, meme contrainte d'unicite (annee, enseignant, matiere, classe,
 * groupe, periode) : deux professeurs peuvent donc se partager un groupe, et un
 * meme professeur peut avoir la classe entiere ET un groupe qui en sort.
 */
export async function createGroupAssignment(
  ctx: TenantContext,
  groupId: string,
  input: GroupAssignmentInput,
): Promise<void> {
  requireWritable(ctx, 'assignments.manage');
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
  const supabase = await createClient();

  const { error } = await supabase.from('teaching_assignments').insert({
    school_id: ctx.school.id,
    academic_year_id: ctx.academicYear.id,
    teacher_id: input.teacherId,
    subject_id: input.subjectId,
    group_id: groupId,
    weekly_minutes: input.weeklyMinutes,
    status: 'ACTIVE',
  });
  if (error) {
    if (error.code === '23505') {
      throw new ConflictError('Cet enseignant est déjà affecté à cette matière pour ce groupe.');
    }
    throw error;
  }
  await audit(ctx, {
    action: 'assignments.create',
    module: 'assignments',
    entityType: 'teaching_assignment',
    after: { ...input, groupId },
  });
}

export type GroupAssignmentRow = {
  id: string;
  teacherName: string;
  subjectName: string;
  weeklyMinutes: number;
};

export async function listGroupAssignments(ctx: TenantContext, groupId: string): Promise<GroupAssignmentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('teaching_assignments')
    .select('id, weekly_minutes, teachers(first_name, last_name), subjects(name)')
    .eq('school_id', ctx.school.id)
    .eq('group_id', groupId)
    .eq('status', 'ACTIVE');
  return ((data ?? []) as unknown as {
    id: string;
    weekly_minutes: number;
    teachers: { first_name: string; last_name: string } | null;
    subjects: { name: string } | null;
  }[])
    .map((a) => ({
      id: a.id,
      teacherName: a.teachers ? `${a.teachers.last_name.toUpperCase()} ${a.teachers.first_name}` : '—',
      subjectName: a.subjects?.name ?? '—',
      weeklyMinutes: a.weekly_minutes,
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName));
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
      throw new ConflictError('Cette affectation est utilisée (exigence ou emploi du temps).');
    }
    throw error;
  }
  if (!count) throw new NotFoundError('Affectation introuvable.');
  await audit(ctx, { action: 'assignments.delete', module: 'assignments', entityType: 'teaching_assignment', entityId: id });
}

export type GridSave = { created: number; changed: number; removed: number };

/**
 * Enregistre une grille entière d'un coup.
 *
 * Chaque case porte la classe, la matière et l'enseignant choisi. Une case
 * vidée retire l'affectation ; une case changée déplace l'enseignement d'un
 * enseignant à un autre. Le volume horaire vient du PROGRAMME du niveau, il
 * n'est plus saisi à la main : c'est la même information, elle n'a pas à être
 * retapée cent soixante fois.
 */
export async function saveAssignmentGrid(
  ctx: TenantContext,
  levelId: string,
  cells: { classId: string; subjectId: string; teacherId: string | null }[],
): Promise<GridSave> {
  requireWritable(ctx, 'assignments.manage');
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
  const yearId = ctx.academicYear.id;
  const supabase = await createClient();

  // Volumes du programme de ce niveau : une minute saisie une fois, réutilisée.
  const { data: programme } = await supabase
    .from('level_subjects')
    .select('subject_id, weekly_minutes')
    .eq('school_id', ctx.school.id)
    .eq('level_id', levelId);
  const minutes = new Map(
    ((programme ?? []) as { subject_id: string; weekly_minutes: number }[]).map((r) => [r.subject_id, r.weekly_minutes]),
  );

  const classIds = [...new Set(cells.map((c) => c.classId))];
  const { data: current } = await supabase
    .from('teaching_assignments')
    .select('id, teacher_id, subject_id, class_id')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE')
    .in('class_id', classIds.length > 0 ? classIds : ['00000000-0000-0000-0000-000000000000']);

  const existing = new Map(
    ((current ?? []) as { id: string; teacher_id: string; subject_id: string; class_id: string | null }[])
      .filter((r) => r.class_id)
      .map((r) => [`${r.class_id}:${r.subject_id}`, r]),
  );

  const toInsert: {
    school_id: string;
    academic_year_id: string;
    teacher_id: string;
    subject_id: string;
    class_id: string;
    weekly_minutes: number;
    status: 'ACTIVE';
  }[] = [];
  const toRemove: string[] = [];
  let changed = 0;

  for (const cell of cells) {
    const key = `${cell.classId}:${cell.subjectId}`;
    const row = existing.get(key);
    if (!cell.teacherId) {
      if (row) toRemove.push(row.id);
      continue;
    }
    if (row && row.teacher_id === cell.teacherId) continue;
    if (row) {
      // Changer d'enseignant = retirer l'ancien, poser le nouveau : la table
      // interdit deux enseignants sur la même matière d'une même classe.
      toRemove.push(row.id);
      changed++;
    }
    toInsert.push({
      school_id: ctx.school.id,
      academic_year_id: yearId,
      teacher_id: cell.teacherId,
      subject_id: cell.subjectId,
      class_id: cell.classId,
      weekly_minutes: minutes.get(cell.subjectId) ?? 0,
      status: 'ACTIVE',
    });
  }

  if (toRemove.length > 0) {
    const { error } = await supabase.from('teaching_assignments').delete().eq('school_id', ctx.school.id).in('id', toRemove);
    if (error) throw error;
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from('teaching_assignments').insert(toInsert);
    if (error) throw error;
  }

  const created = toInsert.length - changed;
  const removed = toRemove.length - changed;
  await audit(ctx, {
    action: 'assignments.grid_save',
    module: 'assignments',
    entityType: 'teaching_assignment',
    after: { level: levelId, created, changed, removed },
  });
  return { created, changed, removed };
}

/**
 * Reprend les affectations de l'année précédente pour ce niveau : même classe
 * (par son code), même matière, même enseignant. Ce qui n'existe plus est
 * ignoré — une classe supprimée, un enseignant parti.
 */
export async function carryOverAssignments(ctx: TenantContext, levelId: string): Promise<{ added: number }> {
  requireWritable(ctx, 'assignments.manage');
  if (!ctx.academicYear) throw new ValidationError("Activez une année scolaire d'abord.");
  const supabase = await createClient();

  const { data: years } = await supabase
    .from('academic_years')
    .select('id, starts_on')
    .eq('school_id', ctx.school.id)
    .lt('starts_on', (await currentYearStart(ctx)) ?? '9999-12-31')
    .order('starts_on', { ascending: false })
    .limit(1);
  const previous = (years ?? [])[0];
  if (!previous) throw new ValidationError('Aucune année précédente à reconduire.');

  const [{ data: oldClasses }, { data: newClasses }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, code')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', previous.id)
      .eq('level_id', levelId),
    supabase
      .from('classes')
      .select('id, code')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', ctx.academicYear.id)
      .eq('level_id', levelId)
      .eq('status', 'ACTIVE'),
  ]);

  const newByCode = new Map(((newClasses ?? []) as { id: string; code: string }[]).map((c) => [c.code, c.id]));
  const oldIds = ((oldClasses ?? []) as { id: string; code: string }[]).map((c) => c.id);
  if (oldIds.length === 0) return { added: 0 };

  const { data: oldAssignments } = await supabase
    .from('teaching_assignments')
    .select('teacher_id, subject_id, class_id, classes(code)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', previous.id)
    .in('class_id', oldIds);

  const cells = ((oldAssignments ?? []) as unknown as {
    teacher_id: string;
    subject_id: string;
    classes: { code: string } | null;
  }[])
    .map((a) => ({
      classId: a.classes ? (newByCode.get(a.classes.code) ?? '') : '',
      subjectId: a.subject_id,
      teacherId: a.teacher_id,
    }))
    .filter((c) => c.classId);

  if (cells.length === 0) return { added: 0 };
  const r = await saveAssignmentGrid(ctx, levelId, cells);
  return { added: r.created + r.changed };
}

async function currentYearStart(ctx: TenantContext): Promise<string | null> {
  if (!ctx.academicYear) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('academic_years').select('starts_on').eq('id', ctx.academicYear.id).maybeSingle();
  return (data?.starts_on as string | undefined) ?? null;
}
