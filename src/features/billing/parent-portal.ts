import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * L'Espace Parent vu par l'école (0172) : prix par enfant, élèves activés, et
 * la réduction gagnée sur le prochain abonnement (paliers réglés par la
 * plateforme). null si la base ne répond pas ou si la personne n'a pas le droit.
 */
export type ParentStats = {
  price: number;
  students: number;
  activated: number;
  thisWeek: number;
  discountPct: number;
  tiers: { minPct: number; discountPct: number }[];
};

export async function readParentStats(ctx: TenantContext): Promise<ParentStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('school_parent_overview' as never, { p_school: ctx.school.id } as never);
  if (error || !data) return null;
  const j = data as unknown as ParentStats;
  return {
    price: Number(j.price ?? 0),
    students: Number(j.students ?? 0),
    activated: Number(j.activated ?? 0),
    thisWeek: Number(j.thisWeek ?? 0),
    discountPct: Number(j.discountPct ?? 0),
    tiers: (j.tiers ?? []).map((t) => ({ minPct: Number(t.minPct), discountPct: Number(t.discountPct) })).sort((a, b) => a.minPct - b.minPct),
  };
}

/** Le palier suivant : combien d'élèves encore pour quelle réduction ; null si tout est atteint. */
export function nextTier(s: ParentStats): { missing: number; minPct: number; discountPct: number } | null {
  if (s.students <= 0) return null;
  const pct = (s.activated * 100) / s.students;
  const next = s.tiers.find((t) => pct < t.minPct);
  if (!next) return null;
  return { missing: Math.max(0, Math.ceil((next.minPct * s.students) / 100) - s.activated), minPct: next.minPct, discountPct: next.discountPct };
}

/** Un prix après réduction, arrondi au franc. */
export const discounted = (price: number, pct: number) => Math.round((price * (100 - pct)) / 100);
