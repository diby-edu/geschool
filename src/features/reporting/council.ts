import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';
import { gradingParams, rpcArgs } from '@/features/evaluations/scale';

/**
 * La moyenne retenue par le conseil de classe (migration 0113) : repêchage,
 * dérogation. Elle REMPLACE la moyenne calculée sur le bulletin, sans aucune
 * mention, et le rang est recalculé avec elle. La moyenne calculée reste
 * dans l'application ; tout est journalisé.
 */
export type CouncilAverage = { average: number; computed: number | null; reason: string };

export async function listCouncilAverages(ctx: TenantContext, classId: string, periodId: string): Promise<Map<string, CouncilAverage>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('council_averages')
    .select('student_id, average, computed_average, reason')
    .eq('school_id', ctx.school.id)
    .eq('class_id', classId)
    .eq('academic_period_id', periodId);
  return new Map(
    ((data ?? []) as { student_id: string; average: number | string; computed_average: number | string | null; reason: string }[]).map(
      (r) => [
        r.student_id,
        {
          average: Number(r.average),
          computed: r.computed_average === null ? null : Number(r.computed_average),
          reason: r.reason,
        },
      ],
    ),
  );
}

/** Moyennes retenues de plusieurs élèves sur une période, quelle que soit leur classe. */
export async function councilAveragesFor(ctx: TenantContext, studentIds: string[], periodId: string): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from('council_averages')
    .select('student_id, average')
    .eq('school_id', ctx.school.id)
    .eq('academic_period_id', periodId)
    .in('student_id', studentIds);
  return new Map(((data ?? []) as { student_id: string; average: number | string }[]).map((r) => [r.student_id, Number(r.average)]));
}

export async function setCouncilAverage(
  ctx: TenantContext,
  classId: string,
  periodId: string,
  studentId: string,
  average: number | null,
  computed: number | null,
  reason: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_council_average' as never, {
    p_class: classId,
    p_period: periodId,
    p_student: studentId,
    p_average: average,
    p_computed: computed,
    p_reason: reason,
  } as never);
  if (error) throw error;
  await audit(ctx, {
    action: average === null ? 'reports.council_average_remove' : 'reports.council_average',
    module: 'reports',
    entityType: 'student',
    entityId: studentId,
    after: { classId, periodId, average, computed, reason },
  });
}

/** Moyennes générales CALCULÉES de la classe (sans moyenne retenue) : ce que le conseil corrige. */
export async function computedGeneralAverages(ctx: TenantContext, classId: string, periodId: string): Promise<Map<string, number | null>> {
  const params = await gradingParams(ctx);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('class_period_ranking' as never, { p_class: classId, p_period: periodId, ...rpcArgs(params) } as never);
  if (error) throw error;
  return new Map(
    ((data ?? []) as { student_id: string; general_average: number | string | null }[]).map((r) => [
      r.student_id,
      r.general_average === null ? null : Number(r.general_average),
    ]),
  );
}
