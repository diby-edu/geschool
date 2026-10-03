import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Le découpage de l'année, vu depuis les bulletins.
 *
 * Un établissement peut suivre deux découpages à la fois : trimestres pour le
 * général, semestres pour le technique (migration 0066). Les coefficients de
 * période sont donc rangés par RANG, et l'écran de réglage doit proposer autant
 * de lignes que la plus longue série.
 */

export type GradingPeriod = {
  id: string;
  name: string;
  sequence: number;
  tracks: string[] | null;
  startsOn: string;
  endsOn: string;
};

export async function listGradingPeriods(ctx: TenantContext, yearId: string): Promise<GradingPeriod[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('academic_periods')
    .select('id, name, sequence, tracks, starts_on, ends_on')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('is_grading_period', true)
    .order('sequence');
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    sequence: p.sequence,
    tracks: (p.tracks as string[] | null) ?? null,
    startsOn: p.starts_on,
    endsOn: p.ends_on,
  }));
}

/** Les périodes qui concernent un ordre d'enseignement, dans l'ordre. */
export function periodsOfTrack(periods: GradingPeriod[], track: string): GradingPeriod[] {
  return periods.filter((p) => p.tracks === null || p.tracks.includes(track)).sort((a, b) => a.sequence - b.sequence);
}

/**
 * Est-ce la DERNIÈRE période de notation de l'année pour cette classe ?
 *
 * C'est elle, et elle seule, qui porte la moyenne annuelle, la mention de
 * l'année et la décision de passage. Aucun réglage à faire : le rang le plus
 * haut dans l'ordre d'enseignement de la classe suffit — 3ᵉ trimestre pour le
 * général, 2ᵉ semestre pour le technique et le professionnel.
 */
export function isLastPeriod(periods: GradingPeriod[], track: string, periodId: string): boolean {
  const list = periodsOfTrack(periods, track);
  const last = list[list.length - 1];
  return !!last && last.id === periodId;
}

/** Les périodes qui précèdent celle-ci, pour le rappel imprimé sur le bulletin. */
export function periodsBefore(periods: GradingPeriod[], track: string, periodId: string): GradingPeriod[] {
  const list = periodsOfTrack(periods, track);
  const i = list.findIndex((p) => p.id === periodId);
  return i <= 0 ? [] : list.slice(0, i);
}

/**
 * La forme du découpage, pour l'écran de réglage : combien de périodes au plus,
 * et sous quels noms. Quand deux ordres coexistent, on montre le plus long.
 */
export function periodShape(periods: GradingPeriod[]): { count: number; names: string[] } {
  const tracks = new Set<string>();
  for (const p of periods) for (const t of p.tracks ?? []) tracks.add(t);

  if (tracks.size === 0) {
    const names = [...periods].sort((a, b) => a.sequence - b.sequence).map((p) => p.name);
    return { count: Math.max(names.length, 1), names };
  }

  let meilleur: GradingPeriod[] = [];
  for (const t of tracks) {
    const list = periodsOfTrack(periods, t);
    if (list.length > meilleur.length) meilleur = list;
  }
  return { count: Math.max(meilleur.length, 1), names: meilleur.map((p) => p.name) };
}
