import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

import type { EducationTrack } from './official-tracks';

export type CycleRow = { id: string; code: string; name: string; sequence: number; track: EducationTrack };
export type LevelRow = {
  id: string;
  code: string;
  name: string;
  sequence: number;
  cycle_id: string;
  cycle_name: string | null;
  /** Ordre d'enseignement du niveau (celui de son cycle). */
  track: EducationTrack;
  /** Diplôme préparé (formation professionnelle). */
  diploma: string | null;
};

export async function listCycles(ctx: TenantContext): Promise<CycleRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('cycles')
    .select('id, code, name, sequence, track')
    .eq('school_id', ctx.school.id)
    .order('sequence')
    .order('name');
  return (data ?? []) as CycleRow[];
}

export async function listLevels(ctx: TenantContext): Promise<LevelRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('levels')
    .select('id, code, name, sequence, cycle_id, diploma, cycles(name, track)')
    .eq('school_id', ctx.school.id)
    .order('sequence')
    .order('name');
  return ((data ?? []) as unknown as (Omit<LevelRow, 'cycle_name' | 'track'> & { cycles: { name: string; track: EducationTrack } | null })[]).map(
    (l) => ({ ...l, cycle_name: l.cycles?.name ?? null, track: l.cycles?.track ?? 'GENERAL' }),
  );
}

/**
 * Ordres d'enseignement choisis par l'établissement (inscription). Un lycée qui
 * n'a coché que le général ne doit jamais voir les séries techniques ni les
 * diplômes professionnels.
 */
export async function schoolTracks(ctx: TenantContext): Promise<EducationTrack[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('schools').select('education_tracks').eq('id', ctx.school.id).maybeSingle();
  const tracks = (data?.education_tracks ?? []) as EducationTrack[];
  return tracks.length > 0 ? tracks : ['GENERAL'];
}
