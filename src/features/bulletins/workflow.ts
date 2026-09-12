import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';

/**
 * Transitions groupées des bulletins d'une classe pour une période.
 * GENERATED -> VALIDATED (conseil de classe) -> PUBLISHED (visible des familles).
 * Les familles ne voient que les PUBLISHED (RLS 0023).
 */

export async function validateBulletins(ctx: TenantContext, classId: string, periodId: string): Promise<number> {
  requireWritable(ctx, 'reports.validate');
  return transition(ctx, classId, periodId, ['GENERATED'], 'VALIDATED', 'reports.validate_batch');
}

export async function publishBulletins(ctx: TenantContext, classId: string, periodId: string): Promise<number> {
  requireWritable(ctx, 'reports.publish');
  return transition(ctx, classId, periodId, ['VALIDATED', 'GENERATED'], 'PUBLISHED', 'reports.publish_batch');
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
): Promise<number> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status: to };
  if (to === 'PUBLISHED') patch.published_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('report_cards')
    .update(patch as never)
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('academic_period_id', periodId)
    .in('status', from as ('DRAFT' | 'GENERATED' | 'VALIDATED' | 'PUBLISHED')[])
    .select('id');
  if (error) throw error;
  const count = data?.length ?? 0;
  await audit(ctx, { action, module: 'reports', entityType: 'report_card', after: { classId, periodId, count, to } });
  return count;
}
