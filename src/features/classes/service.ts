import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import type { ClassInput } from './schemas';

function requireYear(ctx: TenantContext): string {
  if (!ctx.academicYear) {
    throw new ValidationError("Activez une annee scolaire avant de creer des classes.");
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
    if (error.code === '23505') throw new ConflictError('Une classe porte deja ce code cette annee.');
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
    if (error.code === '23505') throw new ConflictError('Une classe porte deja ce code cette annee.');
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
      throw new ConflictError('Cette classe a des inscriptions ou des affectations et ne peut pas etre supprimee.');
    }
    throw error;
  }
  if (!count) throw new NotFoundError('Classe introuvable.');
  await audit(ctx, { action: 'classes.delete', module: 'classes', entityType: 'class', entityId: id });
}
