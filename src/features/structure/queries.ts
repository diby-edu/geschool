import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type CycleRow = { id: string; code: string; name: string; sequence: number };
export type LevelRow = {
  id: string;
  code: string;
  name: string;
  sequence: number;
  cycle_id: string;
  cycle_name: string | null;
};

export async function listCycles(ctx: TenantContext): Promise<CycleRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('cycles')
    .select('id, code, name, sequence')
    .eq('school_id', ctx.school.id)
    .order('sequence')
    .order('name');
  return (data ?? []) as CycleRow[];
}

export async function listLevels(ctx: TenantContext): Promise<LevelRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('levels')
    .select('id, code, name, sequence, cycle_id, cycles(name)')
    .eq('school_id', ctx.school.id)
    .order('sequence')
    .order('name');
  return ((data ?? []) as unknown as (Omit<LevelRow, 'cycle_name'> & { cycles: { name: string } | null })[]).map(
    (l) => ({ ...l, cycle_name: l.cycles?.name ?? null }),
  );
}
