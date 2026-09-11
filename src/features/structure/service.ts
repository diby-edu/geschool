import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError } from '@/lib/errors';
import type { CycleInput, LevelInput } from './schemas';

export async function createCycle(ctx: TenantContext, input: CycleInput): Promise<void> {
  requireWritable(ctx, 'cycles.manage');
  const supabase = await createClient();
  const { error } = await supabase.from('cycles').insert({ school_id: ctx.school.id, ...input });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un cycle porte deja ce code.');
    throw error;
  }
  await audit(ctx, { action: 'cycles.create', module: 'structure', entityType: 'cycle', after: input });
}

export async function deleteCycle(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'cycles.manage');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('cycles')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Ce cycle contient des niveaux.');
    throw error;
  }
  if (!count) throw new NotFoundError('Cycle introuvable.');
  await audit(ctx, { action: 'cycles.delete', module: 'structure', entityType: 'cycle', entityId: id });
}

export async function createLevel(ctx: TenantContext, input: LevelInput): Promise<void> {
  requireWritable(ctx, 'levels.manage');
  const supabase = await createClient();
  // Le cycle doit appartenir a l'etablissement (verifie par la RLS a l'insert,
  // mais on le controle explicitement pour un message clair).
  const { data: cycle } = await supabase
    .from('cycles')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('id', input.cycleId)
    .maybeSingle();
  if (!cycle) throw new NotFoundError('Cycle introuvable.');

  const { error } = await supabase.from('levels').insert({
    school_id: ctx.school.id,
    cycle_id: input.cycleId,
    code: input.code,
    name: input.name,
    sequence: input.sequence,
  });
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un niveau porte deja ce code.');
    throw error;
  }
  await audit(ctx, { action: 'levels.create', module: 'structure', entityType: 'level', after: input });
}

export async function deleteLevel(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'levels.manage');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('levels')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Ce niveau est utilise (classes, programme).');
    throw error;
  }
  if (!count) throw new NotFoundError('Niveau introuvable.');
  await audit(ctx, { action: 'levels.delete', module: 'structure', entityType: 'level', entityId: id });
}
