import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type RankingRow = {
  studentId: string;
  matricule: string;
  name: string;
  average: number | null;
  rank: number | null;
  classSize: number;
};

/**
 * Classement d'une classe sur une période (moyenne générale pondérée par les
 * coefficients du programme, rang ex æquo au sens usuel). Calcul en base via
 * app.class_period_ranking (0022), exposé par le wrapper public (0036).
 *
 * SECURITY INVOKER : le calcul ne voit que les notes lisibles par l'appelant —
 * cet écran est donc réservé à « grades.view_all » pour être exact et complet.
 */
export async function classRanking(ctx: TenantContext, classId: string, periodId: string): Promise<RankingRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('class_period_ranking' as never, {
    p_class: classId,
    p_period: periodId,
  } as never);
  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    student_id: string;
    general_average: number | null;
    rank_position: number | null;
    class_size: number;
  }[];
  if (rows.length === 0) return [];

  const { data: students } = await supabase
    .from('students')
    .select('id, matricule, first_name, last_name')
    .eq('school_id', ctx.school.id)
    .in('id', rows.map((r) => r.student_id));
  const byId = new Map((students ?? []).map((s) => [s.id, s]));

  return rows
    .map((r) => {
      const s = byId.get(r.student_id);
      return {
        studentId: r.student_id,
        matricule: s?.matricule ?? '',
        name: s ? `${s.last_name.toUpperCase()} ${s.first_name}` : '—',
        average: r.general_average === null ? null : Number(r.general_average),
        rank: r.rank_position,
        classSize: r.class_size,
      };
    })
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name));
}
