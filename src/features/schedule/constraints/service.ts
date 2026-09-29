import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  CONSTRAINT_BY_CODE,
  CONSTRAINT_SCOPES,
  describeRule,
  validateParams,
  type ConstraintScope,
  type ParamValues,
  type Severity,
} from './catalog';

/**
 * Les règles d'emploi du temps d'une année : lecture, ajout, suppression.
 *
 * Une règle enregistrée ici est une règle que le générateur appliquera. On
 * refuse donc à l'écriture tout ce qu'il ne saurait pas appliquer : un code
 * absent du catalogue, une portée que la règle n'accepte pas, une sévérité
 * qu'elle n'autorise pas, un paramètre hors bornes. Mieux vaut un refus visible
 * qu'une règle inerte dans la liste.
 */

export type ScheduleRule = {
  id: string;
  code: string;
  scopeType: ConstraintScope;
  scopeId: string | null;
  severity: Severity;
  weight: number;
  enabled: boolean;
  params: ParamValues;
  /** La règle relue en français, pour la liste. */
  summary: string;
};

export type NewRule = {
  code: string;
  scopeType: ConstraintScope;
  scopeId: string | null;
  severity: Severity;
  weight: number;
  params: ParamValues;
};

/** Poids par défaut d'une préférence : toutes se valent tant que l'école n'a rien dit. */
export const DEFAULT_WEIGHT = 10;

export async function listRules(ctx: TenantContext): Promise<ScheduleRule[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_constraints')
    .select('id, constraint_code, scope_type, scope_id, severity, weight, is_enabled, parameters')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('created_at');

  return ((data ?? []) as {
    id: string;
    constraint_code: string;
    scope_type: string;
    scope_id: string | null;
    severity: string;
    weight: number;
    is_enabled: boolean;
    parameters: unknown;
  }[])
    // Une règle dont le code a disparu du catalogue ne s'affiche pas : elle ne
    // serait plus appliquée, et la montrer ferait croire le contraire.
    .filter((r) => CONSTRAINT_BY_CODE.has(r.constraint_code))
    .map((r) => {
      const def = CONSTRAINT_BY_CODE.get(r.constraint_code)!;
      const params = (r.parameters && typeof r.parameters === 'object' ? r.parameters : {}) as ParamValues;
      return {
        id: r.id,
        code: r.constraint_code,
        scopeType: r.scope_type as ConstraintScope,
        scopeId: r.scope_id,
        severity: r.severity as Severity,
        weight: Number(r.weight),
        enabled: r.is_enabled,
        params,
        summary: describeRule(def, params),
      };
    });
}

export async function createRule(ctx: TenantContext, input: NewRule): Promise<void> {
  requireWritable(ctx, 'schedule.manage_constraints');
  const yearId = ctx.academicYear?.id;
  if (!yearId) throw new ValidationError('Activez une année scolaire d’abord.');

  const def = CONSTRAINT_BY_CODE.get(input.code);
  if (!def) throw new ValidationError('Règle inconnue.');
  if (!CONSTRAINT_SCOPES.includes(input.scopeType)) throw new ValidationError('Portée inconnue.');
  if (!def.scopes.includes(input.scopeType)) {
    throw new ValidationError(`« ${def.label} » ne s’applique pas à cette portée.`);
  }
  if (!def.severities.includes(input.severity)) {
    throw new ValidationError(`« ${def.label} » ne peut pas être ${input.severity === 'HARD' ? 'obligatoire' : 'une préférence'}.`);
  }
  // Toute portée autre que l'établissement vise quelqu'un ou quelque chose.
  if (input.scopeType !== 'SCHOOL' && !input.scopeId) {
    throw new ValidationError('Choisissez sur qui porte la règle.');
  }

  const problems = validateParams(def, input.params);
  if (problems.length > 0) throw new ValidationError(problems.map((p) => p.message).join(' '));

  const supabase = await createClient();
  const { error } = await supabase.from('schedule_constraints').insert({
    school_id: ctx.school.id,
    academic_year_id: yearId,
    constraint_code: input.code,
    scope_type: input.scopeType,
    scope_id: input.scopeType === 'SCHOOL' ? null : input.scopeId,
    severity: input.severity,
    weight: input.severity === 'SOFT' ? Math.max(1, Math.min(input.weight, 100)) : 0,
    is_enabled: true,
    parameters: input.params as never,
    created_by: ctx.user.id,
  });
  if (error) throw error;

  await audit(ctx, {
    action: 'schedule.constraint_create',
    module: 'schedule',
    entityType: 'schedule_constraint',
    after: { code: input.code, scope: input.scopeType, severity: input.severity },
  });
}

/**
 * Désactiver plutôt que supprimer, quand l'école veut juste essayer sans une
 * règle : elle la retrouve telle quelle si la génération ne donne rien de bon.
 */
export async function toggleRule(ctx: TenantContext, id: string, enabled: boolean): Promise<void> {
  requireWritable(ctx, 'schedule.manage_constraints');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('schedule_constraints')
    .update({ is_enabled: enabled }, { count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Règle introuvable.');
  await audit(ctx, {
    action: enabled ? 'schedule.constraint_enable' : 'schedule.constraint_disable',
    module: 'schedule',
    entityType: 'schedule_constraint',
    entityId: id,
  });
}

export async function deleteRule(ctx: TenantContext, id: string): Promise<void> {
  requireWritable(ctx, 'schedule.manage_constraints');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('schedule_constraints')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new NotFoundError('Règle introuvable.');
  await audit(ctx, {
    action: 'schedule.constraint_delete',
    module: 'schedule',
    entityType: 'schedule_constraint',
    entityId: id,
  });
}
