import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';

/**
 * Moyennes de l'ancienne école d'un élève arrivé en cours d'année (0114),
 * utilisées seulement si l'établissement a choisi l'option « ancienne école ».
 */

/** `${studentId}:${periodId}` -> moyenne de l'ancienne école. */
export async function previousSchoolAverages(
  ctx: TenantContext,
  studentIds: string[],
  periodIds: string[],
): Promise<Map<string, { average: number; school: string | null }>> {
  const out = new Map<string, { average: number; school: string | null }>();
  if (studentIds.length === 0 || periodIds.length === 0) return out;
  const supabase = await createClient();
  for (let i = 0; i < studentIds.length; i += 150) {
    const { data } = await supabase
      .from('previous_school_averages')
      .select('student_id, academic_period_id, average, previous_school')
      .eq('school_id', ctx.school.id)
      .in('academic_period_id', periodIds)
      .in('student_id', studentIds.slice(i, i + 150));
    for (const r of (data ?? []) as { student_id: string; academic_period_id: string; average: number | string; previous_school: string | null }[]) {
      out.set(`${r.student_id}:${r.academic_period_id}`, { average: Number(r.average), school: r.previous_school });
    }
  }
  return out;
}

export async function setPreviousSchoolAverage(
  ctx: TenantContext,
  studentId: string,
  periodId: string,
  average: number | null,
  previousSchool: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_previous_school_average' as never, {
    p_student: studentId,
    p_period: periodId,
    p_average: average,
    p_previous_school: previousSchool,
  } as never);
  if (error) throw error;
  await audit(ctx, {
    action: average === null ? 'reports.previous_school_remove' : 'reports.previous_school',
    module: 'reports',
    entityType: 'student',
    entityId: studentId,
    after: { periodId, average, previousSchool },
  });
}
