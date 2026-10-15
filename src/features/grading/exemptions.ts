import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';

/**
 * Dispense d'EPS (migration 0110) : décidée par le professeur d'EPS de l'élève,
 * pour une période. L'élève reste dans la liste, mais ne peut pas recevoir de
 * note ; sa moyenne affiche « Dispensé » et l'EPS ne compte pas dans sa
 * moyenne générale. La base vérifie qui a le droit, et journalise.
 */

/** La matière est-elle l'EPS ? Même règle que `app.is_eps` en base. */
export function isEpsSubject(s: { code?: string | null; name: string }): boolean {
  const name = s.name.trim().toLowerCase();
  return (
    (s.code ?? '').toUpperCase() === 'EPS' ||
    name.startsWith('eps') ||
    name.startsWith('éducation physique') ||
    name.startsWith('education physique')
  );
}

export async function isEps(ctx: TenantContext, subjectId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subjects')
    .select('code, name')
    .eq('school_id', ctx.school.id)
    .eq('id', subjectId)
    .maybeSingle();
  return data ? isEpsSubject(data) : false;
}

/** Élèves dispensés de cette matière sur cette période. */
export async function listExemptions(ctx: TenantContext, periodId: string, subjectId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subject_exemptions')
    .select('student_id')
    .eq('school_id', ctx.school.id)
    .eq('academic_period_id', periodId)
    .eq('subject_id', subjectId);
  return new Set((data ?? []).map((r) => r.student_id));
}

export async function setExemption(
  ctx: TenantContext,
  studentId: string,
  periodId: string,
  subjectId: string,
  exempt: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_eps_exemption' as never, {
    p_student: studentId,
    p_period: periodId,
    p_subject: subjectId,
    p_exempt: exempt,
  } as never);
  if (error) throw error;
  await audit(ctx, {
    action: exempt ? 'grades.exemption_add' : 'grades.exemption_remove',
    module: 'grades',
    entityType: 'student',
    entityId: studentId,
    after: { periodId, subjectId },
  });
}
