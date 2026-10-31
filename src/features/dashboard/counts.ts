import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';

/**
 * Tous les comptages du tableau de bord en une lecture (0167). Un bloc absent =
 * droit absent. Partagé dans la requête (cache) entre l'aperçu et la liste
 * « démarrage » : une seule lecture pour les deux.
 */
export type DashboardCounts = {
  students_total?: number;
  students_new?: number;
  teachers?: { total: number; with_access: number; by_contract: Record<string, number> };
  parents?: { families: number; total: number; activated: number; pending: number };
  pending_justifications?: number;
  schedule_published?: number;
  setup?: Record<'levels' | 'classes' | 'subjects' | 'teachers' | 'students' | 'periods' | 'scales' | 'staff' | 'hours', boolean>;
};

/** null = la migration 0167 n'est pas appliquée ou la lecture a échoué : l'appelant relit à l'ancienne. */
export const dashboardCounts = cache(async (schoolId: string, yearId: string | null, since: string): Promise<DashboardCounts | null> => {
  const supabase = await createClient();
  const res = await callRpc<DashboardCounts>(supabase, 'dashboard_counts', { p_school: schoolId, p_year: yearId, p_since: since });
  return res.data ?? null;
});
