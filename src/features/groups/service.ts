import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { fetchAllRows } from '@/lib/supabase/pagination';
import type { GroupInput } from './schemas';
import type { GroupStudent } from './types';

export type { GroupStudent } from './types';

/**
 * Les groupes d'élèves : création, composition, et les classes qu'ils
 * traversent.
 *
 * Les tables existaient depuis l'origine et l'emploi du temps savait déjà leur
 * faire cours — il manquait tout le haut : les créer, les remplir, les confier
 * à un enseignant. C'est ce que fait ce module.
 */

export type GroupRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  subject_id: string | null;
  subject_name: string | null;
  max_size: number | null;
  status: string;
  /** Classes d'où le groupe tire ses élèves. */
  classes: { id: string; name: string }[];
  /** Élèves actuellement dedans. */
  members: number;
};

type RawGroup = {
  id: string;
  code: string;
  name: string;
  kind: string;
  subject_id: string | null;
  max_size: number | null;
  status: string;
  subjects: { name: string } | null;
  group_classes: { class_id: string; classes: { name: string } | null }[];
  student_groups: { count: number }[];
};

const SELECT =
  'id, code, name, kind, subject_id, max_size, status, subjects(name), ' +
  'group_classes(class_id, classes(name)), student_groups(count)';

function toRow(g: RawGroup): GroupRow {
  return {
    id: g.id,
    code: g.code,
    name: g.name,
    kind: g.kind,
    subject_id: g.subject_id,
    subject_name: g.subjects?.name ?? null,
    max_size: g.max_size,
    status: g.status,
    classes: (g.group_classes ?? [])
      .map((c) => ({ id: c.class_id, name: c.classes?.name ?? '—' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    members: g.student_groups?.[0]?.count ?? 0,
  };
}

export async function listGroups(ctx: TenantContext, yearId: string): Promise<GroupRow[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<RawGroup>((cursor) => {
    let q = supabase
      .from('groups')
      .select(SELECT)
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .order('id') // curseur : tri total requis (cf. lib/supabase/pagination)
      .limit(200);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: RawGroup[] | null; error: { message: string } | null }>;
  }, 200);
  return rows.map(toRow).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGroup(ctx: TenantContext, id: string): Promise<GroupRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('groups')
    .select(SELECT)
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  return data ? toRow(data as unknown as RawGroup) : null;
}

export async function createGroup(ctx: TenantContext, yearId: string, input: GroupInput): Promise<string> {
  requireWritable(ctx, 'groups.create');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('groups')
    .insert({
      school_id: ctx.school.id,
      academic_year_id: yearId,
      code: input.code,
      name: input.name,
      kind: input.kind,
      subject_id: input.subjectId || null,
      max_size: input.maxSize === '' || input.maxSize === undefined ? null : Number(input.maxSize),
      status: 'ACTIVE',
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un groupe porte déjà ce code cette année.');
    throw error;
  }

  await replaceClasses(ctx, data.id, input.classIds);
  await audit(ctx, {
    action: 'groups.create',
    module: 'groups',
    entityType: 'group',
    entityId: data.id,
    after: { code: input.code, kind: input.kind, classes: input.classIds.length },
  });
  return data.id;
}

export async function updateGroup(ctx: TenantContext, id: string, input: GroupInput): Promise<void> {
  requireWritable(ctx, 'groups.update');
  const supabase = await createClient();

  const { error, count } = await supabase
    .from('groups')
    .update(
      {
        code: input.code,
        name: input.name,
        kind: input.kind,
        subject_id: input.subjectId || null,
        max_size: input.maxSize === '' || input.maxSize === undefined ? null : Number(input.maxSize),
      },
      { count: 'exact' },
    )
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un groupe porte déjà ce code cette année.');
    throw error;
  }
  if (!count) throw new NotFoundError('Groupe introuvable.');

  await replaceClasses(ctx, id, input.classIds);
  await audit(ctx, { action: 'groups.update', module: 'groups', entityType: 'group', entityId: id, after: input });
}

export async function deleteGroup(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'groups.delete');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('groups')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    // Un groupe qui a cours quelque part ne se supprime pas en silence.
    if (error.code === '23503') {
      throw new ConflictError('Ce groupe est utilisé par un enseignement ou un emploi du temps.');
    }
    throw error;
  }
  if (!count) throw new NotFoundError('Groupe introuvable.');
  await audit(ctx, { action: 'groups.delete', module: 'groups', entityType: 'group', entityId: id });
}

/** Les classes d'où le groupe tire ses élèves : on remplace la liste entière. */
async function replaceClasses(ctx: TenantContext, groupId: string, classIds: string[]): Promise<void> {
  const supabase = await createClient();
  await supabase.from('group_classes').delete().eq('school_id', ctx.school.id).eq('group_id', groupId);
  if (classIds.length === 0) return;
  const { error } = await supabase.from('group_classes').insert(
    classIds.map((classId) => ({ school_id: ctx.school.id, group_id: groupId, class_id: classId })),
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Composition : qui est dans le groupe
// ---------------------------------------------------------------------------

/**
 * Les élèves des classes rattachées au groupe, avec ceux qui y sont déjà.
 *
 * On ne propose JAMAIS un élève d'une autre classe : un groupe tire ses membres
 * des classes qu'on lui a données, et seulement d'elles.
 */
export async function groupRoster(ctx: TenantContext, groupId: string, yearId: string): Promise<GroupStudent[]> {
  const supabase = await createClient();

  const { data: links } = await supabase
    .from('group_classes')
    .select('class_id')
    .eq('school_id', ctx.school.id)
    .eq('group_id', groupId);
  const classIds = (links ?? []).map((l) => l.class_id);
  if (classIds.length === 0) return [];

  const [{ data: enrolled }, { data: members }] = await Promise.all([
    supabase
      .from('student_enrollments')
      .select('student_id, students!inner(matricule, first_name, last_name, deleted_at), classes(name)')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('status', 'ENROLLED')
      .in('class_id', classIds),
    supabase
      .from('student_groups')
      .select('student_id')
      .eq('school_id', ctx.school.id)
      .eq('group_id', groupId)
      .is('left_at', null),
  ]);

  const inGroup = new Set((members ?? []).map((m) => m.student_id));
  return ((enrolled ?? []) as unknown as {
    student_id: string;
    students: { matricule: string; first_name: string; last_name: string; deleted_at: string | null };
    classes: { name: string } | null;
  }[])
    .filter((r) => r.students && !r.students.deleted_at)
    .map((r) => ({
      studentId: r.student_id,
      matricule: r.students.matricule,
      name: `${r.students.last_name.toUpperCase()} ${r.students.first_name}`,
      className: r.classes?.name ?? null,
      inGroup: inGroup.has(r.student_id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Fixe la composition du groupe : la liste donnée devient la liste exacte. */
export async function setGroupMembers(
  ctx: TenantContext,
  groupId: string,
  yearId: string,
  studentIds: string[],
): Promise<{ added: number; removed: number }> {
  requireWritable(ctx, 'groups.assign_students');
  const supabase = await createClient();

  const group = await getGroup(ctx, groupId);
  if (!group) throw new NotFoundError('Groupe introuvable.');
  if (group.max_size !== null && studentIds.length > group.max_size) {
    throw new ValidationError(`Ce groupe est limité à ${group.max_size} élèves ; ${studentIds.length} sont sélectionnés.`);
  }

  const { data: current } = await supabase
    .from('student_groups')
    .select('student_id')
    .eq('school_id', ctx.school.id)
    .eq('group_id', groupId)
    .is('left_at', null);
  const before = new Set((current ?? []).map((r) => r.student_id));
  const after = new Set(studentIds);

  const toAdd = studentIds.filter((id) => !before.has(id));
  const toRemove = [...before].filter((id) => !after.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase.from('student_groups').insert(
      toAdd.map((studentId) => ({
        school_id: ctx.school.id,
        group_id: groupId,
        student_id: studentId,
        academic_year_id: yearId,
      })),
    );
    if (error) throw error;
  }
  for (let i = 0; i < toRemove.length; i += 200) {
    const { error } = await supabase
      .from('student_groups')
      .delete()
      .eq('school_id', ctx.school.id)
      .eq('group_id', groupId)
      .in('student_id', toRemove.slice(i, i + 200));
    if (error) throw error;
  }

  await audit(ctx, {
    action: 'groups.set_members',
    module: 'groups',
    entityType: 'group',
    entityId: groupId,
    after: { added: toAdd.length, removed: toRemove.length, total: studentIds.length },
  });
  return { added: toAdd.length, removed: toRemove.length };
}
