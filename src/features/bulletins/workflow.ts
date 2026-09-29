import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError } from '@/lib/errors';

/**
 * Transitions groupées des bulletins d'une classe pour une période.
 * GENERATED -> VALIDATED (conseil de classe) -> signature du directeur -> PUBLISHED
 * (visible des familles). Chaque etape a son droit (`reports.validate`,
 * `reports.sign`, `reports.publish`), applique aussi en base (declencheur de la
 * migration 0050).
 * Les familles ne voient que les PUBLISHED (RLS 0023).
 */

export async function validateBulletins(ctx: TenantContext, classId: string, periodId: string): Promise<number> {
  requireWritable(ctx, 'reports.validate');
  return transition(ctx, classId, periodId, ['GENERATED'], 'VALIDATED', 'reports.validate_batch');
}

/** Signature (par defaut le directeur) des bulletins valides de la classe. */
export async function signBulletins(ctx: TenantContext, classId: string, periodId: string): Promise<number> {
  requireWritable(ctx, 'reports.sign');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('report_cards')
    .update({ signed_by: ctx.user.id, signed_at: new Date().toISOString() })
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('academic_period_id', periodId)
    .eq('status', 'VALIDATED')
    .is('signed_at', null)
    .select('id');
  if (error) throw error;
  const count = data?.length ?? 0;
  await audit(ctx, { action: 'reports.sign_batch', module: 'reports', entityType: 'report_card', after: { classId, periodId, count } });
  return count;
}

/** Publie les bulletins valides ET signes ; les autres restent en attente de signature. */
export async function publishBulletins(ctx: TenantContext, classId: string, periodId: string): Promise<number> {
  requireWritable(ctx, 'reports.publish');
  const count = await transition(ctx, classId, periodId, ['VALIDATED'], 'PUBLISHED', 'reports.publish_batch', true);
  if (count === 0) {
    throw new ConflictError('Aucun bulletin signé à publier : faites d’abord signer les bulletins validés.');
  }
  return count;
}

export async function unpublishBulletins(ctx: TenantContext, classId: string, periodId: string): Promise<number> {
  requireWritable(ctx, 'reports.publish');
  return transition(ctx, classId, periodId, ['PUBLISHED'], 'VALIDATED', 'reports.unpublish_batch');
}

async function transition(
  ctx: TenantContext,
  classId: string,
  periodId: string,
  from: string[],
  to: string,
  action: string,
  signedOnly = false,
): Promise<number> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status: to };
  if (to === 'PUBLISHED') patch.published_at = new Date().toISOString();
  let query = supabase
    .from('report_cards')
    .update(patch as never)
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('academic_period_id', periodId)
    .in('status', from as ('DRAFT' | 'GENERATED' | 'VALIDATED' | 'PUBLISHED')[]);
  if (signedOnly) query = query.not('signed_at', 'is', null);
  const { data, error } = await query.select('id');
  if (error) throw error;
  const count = data?.length ?? 0;
  await audit(ctx, { action, module: 'reports', entityType: 'report_card', after: { classId, periodId, count, to } });
  return count;
}
