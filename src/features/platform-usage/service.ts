import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AuthorizationError } from '@/lib/errors';

/**
 * L'usage des établissements, pour la plateforme.
 *
 * `usage_records` attendait depuis l'origine : cinq métriques, des règles
 * d'accès correctes, et pas une ligne. On relève, et on montre.
 */

/** Les trois métriques que la base sait relever seule. */
export const snapshotMetrics = ['STUDENTS', 'USERS', 'SCHEDULE_GENERATIONS'] as const;
export type UsageMetric = (typeof snapshotMetrics)[number];

export const USAGE_LABELS: Record<UsageMetric, string> = {
  STUDENTS: 'Élèves inscrits',
  USERS: 'Comptes actifs',
  SCHEDULE_GENERATIONS: 'Emplois du temps générés',
};

export type SchoolUsage = {
  schoolId: string;
  name: string;
  slug: string;
  values: Partial<Record<UsageMetric, number>>;
  recordedFor: string | null;
};

/** Le dernier relevé de chaque école. */
export async function latestUsage(): Promise<SchoolUsage[]> {
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc('is_platform_admin' as never);
  if (!isAdmin) throw new AuthorizationError('Réservé à l’administration de la plateforme.');

  const [{ data: schools }, { data: records }] = await Promise.all([
    supabase.from('schools').select('id, name, slug').order('name'),
    supabase
      .from('usage_records')
      .select('school_id, metric, value, recorded_for')
      .order('recorded_for', { ascending: false }),
  ]);

  // Un relevé par école et par métrique : le plus récent gagne, les autres
  // restent en base pour l'historique.
  const seen = new Set<string>();
  const byId = new Map<string, SchoolUsage>();
  for (const s of schools ?? []) {
    byId.set(s.id, { schoolId: s.id, name: s.name, slug: s.slug, values: {}, recordedFor: null });
  }
  for (const r of (records ?? []) as { school_id: string; metric: string; value: number; recorded_for: string }[]) {
    const key = `${r.school_id}:${r.metric}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = byId.get(r.school_id);
    if (!row) continue;
    row.values[r.metric as UsageMetric] = Number(r.value);
    if (!row.recordedFor || r.recorded_for > row.recordedFor) row.recordedFor = r.recorded_for;
  }
  return [...byId.values()];
}

/** Prend un instantané daté d'aujourd'hui, pour toutes les écoles. */
export async function takeUsageSnapshot(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('snapshot_usage' as never, {} as never);
  if (error) throw error;
  return Number(data ?? 0);
}
