import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { ClassBatchInput, ClassInput } from './schemas';
import { planClasses } from './naming';
import type { HeadTeacherRow } from './head-teachers-types';

export type { HeadTeacherRow };

function requireYear(ctx: TenantContext): string {
  if (!ctx.academicYear) {
    throw new ValidationError("Activez une année scolaire avant de créer des classes.");
  }
  return ctx.academicYear.id;
}

function toRow(input: ClassInput) {
  return {
    level_id: input.levelId,
    code: input.code,
    name: input.name,
    capacity: input.capacity,
    head_teacher_id: input.headTeacherId || null,
    main_room_id: input.mainRoomId || null,
  };
}

export async function createClass(ctx: TenantContext, input: ClassInput): Promise<string> {
  requireWritable(ctx, 'classes.create');
  const yearId = requireYear(ctx);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('classes')
    .insert({ school_id: ctx.school.id, academic_year_id: yearId, status: 'ACTIVE', ...toRow(input) })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une classe porte déjà ce code cette année.');
    throw error;
  }
  await audit(ctx, { action: 'classes.create', module: 'classes', entityType: 'class', entityId: data.id, after: toRow(input) });
  return data.id;
}

export async function updateClass(ctx: TenantContext, id: string, input: ClassInput): Promise<void> {
  requireWritable(ctx, 'classes.update');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('classes')
    .update(toRow(input))
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une classe porte déjà ce code cette année.');
    throw error;
  }
  if (!data) throw new NotFoundError('Classe introuvable.');
  await audit(ctx, { action: 'classes.update', module: 'classes', entityType: 'class', entityId: id, after: toRow(input) });
}

export async function deleteClass(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'classes.delete');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('classes')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new ConflictError('Cette classe a des inscriptions ou des affectations et ne peut pas être supprimée.');
    }
    throw error;
  }
  if (!count) throw new NotFoundError('Classe introuvable.');
  await audit(ctx, { action: 'classes.delete', module: 'classes', entityType: 'class', entityId: id });
}

/**
 * Crée une classe ou toute une série d'un coup (« quinze sixièmes »). Une seule
 * insertion : ou tout passe, ou rien n'est créé. Les codes déjà pris sont
 * signalés avant, avec leurs noms, plutôt qu'une erreur de base illisible.
 */
export async function createClasses(ctx: TenantContext, input: ClassBatchInput): Promise<number> {
  requireWritable(ctx, 'classes.create');
  const yearId = requireYear(ctx);
  const supabase = await createClient();

  const { data: level } = await supabase
    .from('levels')
    .select('id, code, name')
    .eq('school_id', ctx.school.id)
    .eq('id', input.levelId)
    .maybeSingle();
  if (!level) throw new NotFoundError('Niveau introuvable.');

  const plan = planClasses({
    levelCode: level.code,
    levelName: level.name,
    mode: input.mode,
    suffix: input.suffix ?? '',
    count: input.count,
    numbering: input.numbering,
  });
  if (plan.length === 0) throw new ValidationError('Aucune classe à créer.');

  const { data: taken } = await supabase
    .from('classes')
    .select('code')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .in('code', plan.map((p) => p.code));
  const clash = (taken ?? []).map((c) => c.code);
  if (clash.length > 0) {
    throw new ConflictError(
      clash.length === 1
        ? `La classe « ${clash[0]} » existe déjà cette année.`
        : `Ces classes existent déjà cette année : ${clash.join(', ')}.`,
    );
  }

  // Le professeur principal ne vaut que pour une classe unique : le donner à
  // quinze sixièmes n'aurait aucun sens.
  const headTeacher = input.mode === 'ONE' ? input.headTeacherId || null : null;
  const { error } = await supabase.from('classes').insert(
    plan.map((p) => ({
      school_id: ctx.school.id,
      academic_year_id: yearId,
      status: 'ACTIVE' as const,
      level_id: input.levelId,
      code: p.code,
      name: p.name,
      capacity: input.capacity,
      head_teacher_id: headTeacher,
      main_room_id: input.mode === 'ONE' ? input.mainRoomId || null : null,
    })),
  );
  if (error) {
    if (error.code === '23505') throw new ConflictError('Une classe porte déjà ce code cette année.');
    throw error;
  }

  await audit(ctx, {
    action: 'classes.create_batch',
    module: 'classes',
    entityType: 'class',
    after: { level: level.name, created: plan.map((p) => p.code) },
  });
  return plan.length;
}

/**
 * Archiver plutôt que supprimer : une classe qui a vécu porte des inscriptions,
 * des notes, des absences. On la retire des listes sans rien perdre, et on peut
 * la rétablir. La suppression reste possible pour une classe créée par erreur.
 */
export async function setClassStatus(ctx: TenantContext, id: string, status: 'ACTIVE' | 'ARCHIVED'): Promise<void> {
  requireWritable(ctx, status === 'ARCHIVED' ? 'classes.delete' : 'classes.update');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('classes')
    .update({ status })
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new NotFoundError('Classe introuvable.');
  await audit(ctx, {
    action: status === 'ARCHIVED' ? 'classes.archive' : 'classes.restore',
    module: 'classes',
    entityType: 'class',
    entityId: id,
  });
}

export type BulkResult = { done: number; skipped: number; reason: string | null };

/**
 * Archiver, rétablir ou supprimer plusieurs classes d'un coup.
 *
 * Une classe qui résiste (inscriptions, notes) n'interrompt pas les autres :
 * on la compte à part et on le dit. Mieux vaut traiter neuf classes sur dix et
 * l'annoncer que tout refuser pour une seule.
 */
export async function bulkClassAction(
  ctx: TenantContext,
  ids: string[],
  action: 'archive' | 'restore' | 'delete',
): Promise<BulkResult> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) throw new ValidationError('Aucune classe sélectionnée.');

  let done = 0;
  let skipped = 0;
  let reason: string | null = null;

  for (const id of unique) {
    try {
      if (action === 'delete') await deleteClass(ctx, id);
      else await setClassStatus(ctx, id, action === 'archive' ? 'ARCHIVED' : 'ACTIVE');
      done++;
    } catch (error) {
      skipped++;
      if (!reason && error instanceof ConflictError) reason = error.message;
    }
  }
  return { done, skipped, reason };
}


/**
 * Désigner les professeurs principaux de toutes les classes d'un coup.
 * Pour chaque classe : l'actuel, et une suggestion (l'enseignant qui y a le
 * plus d'heures). Sans professeur principal, personne ne certifie la classe.
 */
export async function loadHeadTeacherBoard(ctx: TenantContext): Promise<{
  rows: HeadTeacherRow[];
  teachers: { id: string; name: string }[];
}> {
  const yearId = requireYear(ctx);
  const supabase = await createClient();
  const [{ data: classes }, { data: teachers }, { data: assignments }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, head_teacher_id, levels(name, sequence)')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('status', 'ACTIVE'),
    supabase
      .from('teachers')
      .select('id, first_name, last_name')
      .eq('school_id', ctx.school.id)
      .is('deleted_at', null)
      .order('last_name'),
    supabase
      .from('teaching_assignments')
      .select('class_id, teacher_id, weekly_minutes')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('status', 'ACTIVE')
      .not('class_id', 'is', null),
  ]);

  const minutes = new Map<string, Map<string, number>>();
  for (const a of (assignments ?? []) as { class_id: string; teacher_id: string; weekly_minutes: number | null }[]) {
    const m = minutes.get(a.class_id) ?? new Map<string, number>();
    m.set(a.teacher_id, (m.get(a.teacher_id) ?? 0) + (a.weekly_minutes ?? 0));
    minutes.set(a.class_id, m);
  }

  const rows = ((classes ?? []) as unknown as {
    id: string;
    name: string;
    head_teacher_id: string | null;
    levels: { name: string; sequence: number | null } | null;
  }[])
    .map((c) => {
      const ranked = [...(minutes.get(c.id) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
      return {
        classId: c.id,
        className: c.name,
        level: c.levels?.name ?? null,
        currentId: c.head_teacher_id,
        suggestionId: ranked[0] ?? null,
        classTeacherIds: ranked,
        seq: c.levels?.sequence ?? 999,
      };
    })
    .sort((a, b) => a.seq - b.seq || a.className.localeCompare(b.className, 'fr', { numeric: true }))
    .map(({ seq: _seq, ...r }) => r);

  return {
    rows,
    teachers: ((teachers ?? []) as { id: string; first_name: string; last_name: string }[]).map((t) => ({
      id: t.id,
      name: `${t.last_name.toUpperCase()} ${t.first_name}`,
    })),
  };
}

/** Enregistre les choix ; seules les classes qui changent sont écrites. */
export async function setHeadTeachers(ctx: TenantContext, choices: Map<string, string | null>): Promise<number> {
  requireWritable(ctx, 'classes.update');
  const supabase = await createClient();
  const { data: current } = await supabase
    .from('classes')
    .select('id, name, head_teacher_id')
    .eq('school_id', ctx.school.id)
    .in('id', [...choices.keys()]);
  let changed = 0;
  for (const c of (current ?? []) as { id: string; name: string; head_teacher_id: string | null }[]) {
    const next = choices.get(c.id) ?? null;
    if (next === c.head_teacher_id) continue;
    const { error } = await supabase
      .from('classes')
      .update({ head_teacher_id: next })
      .eq('school_id', ctx.school.id)
      .eq('id', c.id);
    if (error) throw error;
    changed += 1;
    await audit(ctx, {
      action: 'classes.head_teacher',
      module: 'classes',
      entityType: 'class',
      entityId: c.id,
      before: { head_teacher_id: c.head_teacher_id },
      after: { head_teacher_id: next, class: c.name },
    });
  }
  return changed;
}
