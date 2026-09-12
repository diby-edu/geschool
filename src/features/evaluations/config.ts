import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError } from '@/lib/errors';
import type { GradingScaleInput, AssessmentTypeInput } from './schemas';

// --- Barèmes -----------------------------------------------------------------

export type ScaleRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  min_score: number;
  max_score: number;
  passing_score: number;
  decimals: number;
  rounding: string;
  is_default: boolean;
};

export async function listScales(ctx: TenantContext): Promise<ScaleRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('grading_scales')
    .select('id, code, name, kind, min_score, max_score, passing_score, decimals, rounding, is_default')
    .eq('school_id', ctx.school.id)
    .order('is_default', { ascending: false })
    .order('code');
  return (data ?? []) as ScaleRow[];
}

export async function getDefaultScale(ctx: TenantContext): Promise<ScaleRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('grading_scales')
    .select('id, code, name, kind, min_score, max_score, passing_score, decimals, rounding, is_default')
    .eq('school_id', ctx.school.id)
    .eq('is_default', true)
    .maybeSingle();
  return (data ?? null) as ScaleRow | null;
}

export async function saveScale(ctx: TenantContext, input: GradingScaleInput, id?: string): Promise<void> {
  requireWritable(ctx, 'grading.manage_scales');
  const supabase = await createClient();

  // Un seul barème par défaut : on retire le drapeau des autres avant de poser celui-ci.
  if (input.isDefault) {
    await supabase.from('grading_scales').update({ is_default: false }).eq('school_id', ctx.school.id).eq('is_default', true);
  }

  const row = {
    code: input.code,
    name: input.name,
    kind: input.kind,
    min_score: input.minScore,
    max_score: input.maxScore,
    passing_score: input.passingScore,
    decimals: input.decimals,
    rounding: input.rounding,
    is_default: input.isDefault,
  };

  if (id) {
    const { error, count } = await supabase
      .from('grading_scales')
      .update(row, { count: 'exact' })
      .eq('school_id', ctx.school.id)
      .eq('id', id);
    if (error) {
      if (error.code === '23505') throw new ConflictError('Un barème porte déjà ce code.');
      throw error;
    }
    if (!count) throw new NotFoundError('Barème introuvable.');
  } else {
    const { error } = await supabase.from('grading_scales').insert({ school_id: ctx.school.id, ...row });
    if (error) {
      if (error.code === '23505') throw new ConflictError('Un barème porte déjà ce code.');
      throw error;
    }
  }
  await audit(ctx, { action: 'grading.scale_save', module: 'grading', entityType: 'grading_scale', ...(id ? { entityId: id } : {}), after: row });
}

export async function deleteScale(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'grading.manage_scales');
  const supabase = await createClient();
  const { error, count } = await supabase.from('grading_scales').delete({ count: 'exact' }).eq('school_id', ctx.school.id).eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Ce barème est utilisé par des évaluations.');
    throw error;
  }
  if (!count) throw new NotFoundError('Barème introuvable.');
  await audit(ctx, { action: 'grading.scale_delete', module: 'grading', entityType: 'grading_scale', entityId: id });
}

// --- Types d'évaluation ------------------------------------------------------

export type TypeRow = { id: string; code: string; name: string; default_coefficient: number; counts_in_average: boolean; sequence: number };

export async function listTypes(ctx: TenantContext): Promise<TypeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('assessment_types')
    .select('id, code, name, default_coefficient, counts_in_average, sequence')
    .eq('school_id', ctx.school.id)
    .order('sequence')
    .order('code');
  return (data ?? []) as TypeRow[];
}

export async function saveType(ctx: TenantContext, input: AssessmentTypeInput, id?: string): Promise<void> {
  requireWritable(ctx, 'grading.manage_settings');
  const supabase = await createClient();
  const row = {
    code: input.code,
    name: input.name,
    default_coefficient: input.defaultCoefficient,
    counts_in_average: input.countsInAverage,
    sequence: input.sequence,
  };
  if (id) {
    const { error, count } = await supabase.from('assessment_types').update(row, { count: 'exact' }).eq('school_id', ctx.school.id).eq('id', id);
    if (error) {
      if (error.code === '23505') throw new ConflictError('Un type porte déjà ce code.');
      throw error;
    }
    if (!count) throw new NotFoundError('Type introuvable.');
  } else {
    const { error } = await supabase.from('assessment_types').insert({ school_id: ctx.school.id, ...row });
    if (error) {
      if (error.code === '23505') throw new ConflictError('Un type porte déjà ce code.');
      throw error;
    }
  }
  await audit(ctx, { action: 'grading.type_save', module: 'grading', entityType: 'assessment_type', ...(id ? { entityId: id } : {}), after: row });
}

export async function deleteType(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'grading.manage_settings');
  const supabase = await createClient();
  const { error, count } = await supabase.from('assessment_types').delete({ count: 'exact' }).eq('school_id', ctx.school.id).eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Ce type est utilisé par des évaluations.');
    throw error;
  }
  if (!count) throw new NotFoundError('Type introuvable.');
  await audit(ctx, { action: 'grading.type_delete', module: 'grading', entityType: 'assessment_type', entityId: id });
}

/**
 * Crée un jeu de départ raisonnable si l'établissement n'a encore rien
 * configuré : barème /20 par défaut et trois types d'évaluation courants.
 * Ce ne sont que des valeurs de départ (§39), librement modifiables ensuite.
 */
export async function seedDefaults(ctx: TenantContext): Promise<{ scale: boolean; types: number }> {
  requireWritable(ctx, 'grading.manage_scales');
  const supabase = await createClient();

  let scaleCreated = false;
  const existingScale = await getDefaultScale(ctx);
  if (!existingScale) {
    const { error } = await supabase.from('grading_scales').insert({
      school_id: ctx.school.id,
      code: 'SUR20',
      name: 'Note sur 20',
      kind: 'NUMERIC',
      min_score: 0,
      max_score: 20,
      passing_score: 10,
      decimals: 2,
      rounding: 'HALF_UP',
      is_default: true,
    });
    if (error && error.code !== '23505') throw error;
    scaleCreated = !error;
  }

  const { data: types } = await supabase.from('assessment_types').select('code').eq('school_id', ctx.school.id);
  const existingCodes = new Set((types ?? []).map((t) => t.code));
  const defaults = [
    { code: 'INTERRO', name: 'Interrogation', default_coefficient: 1, sequence: 1 },
    { code: 'DEVOIR', name: 'Devoir', default_coefficient: 2, sequence: 2 },
    { code: 'COMPO', name: 'Composition', default_coefficient: 3, sequence: 3 },
  ].filter((d) => !existingCodes.has(d.code));

  let typesCreated = 0;
  if (defaults.length > 0) {
    const { error } = await supabase.from('assessment_types').insert(
      defaults.map((d) => ({ school_id: ctx.school.id, counts_in_average: true, ...d })),
    );
    if (error && error.code !== '23505') throw error;
    typesCreated = error ? 0 : defaults.length;
  }

  await audit(ctx, { action: 'grading.seed_defaults', module: 'grading', entityType: 'grading_scale', after: { scaleCreated, typesCreated } });
  return { scale: scaleCreated, types: typesCreated };
}
