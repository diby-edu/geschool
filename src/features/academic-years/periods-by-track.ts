import type { EducationTrack } from '@/features/structure/official-tracks';

/**
 * Quelles périodes s'appliquent à un ordre d'enseignement ?
 *
 * L'enseignement technique et la formation professionnelle fonctionnent par
 * SEMESTRES, le général par trimestres : les deux découpages cohabitent dans la
 * même année. Une période sans ordre (`tracks` vide) vaut pour toute l'école —
 * c'est le cas d'un établissement qui n'a qu'un ordre. Une période qui vise
 * l'ordre demandé prime sur celles-là.
 *
 * C'est la règle qui garantit qu'un bulletin ne mélange jamais deux ordres : il
 * suit la classe, donc l'ordre de la classe.
 */
export function periodsForTrack<T extends { tracks?: readonly string[] | null }>(
  periods: readonly T[],
  track: EducationTrack,
): T[] {
  const own = periods.filter((p) => (p.tracks ?? []).includes(track));
  return own.length > 0 ? own : periods.filter((p) => (p.tracks ?? []).length === 0);
}

const TRACK_WORDS: Record<string, string> = {
  GENERAL: 'général',
  TECHNIQUE: 'technique',
  PROFESSIONNEL: 'professionnel',
};

/** Libellé à afficher quand plusieurs découpages coexistent : « 1er semestre · technique et professionnel ». */
export function periodScopeLabel(tracks: readonly string[] | null | undefined): string | null {
  const list = (tracks ?? []).map((t) => TRACK_WORDS[t] ?? t);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0]!;
  return `${list.slice(0, -1).join(', ')} et ${list.at(-1)}`;
}

/**
 * Les valeurs proposées dans les formulaires. Le technique et le professionnel
 * partageant leur calendrier, on offre le choix groupé plutôt que deux saisies.
 */
export function trackChoices(schoolTracks: readonly string[]): { value: string; label: string }[] {
  const has = (t: string) => schoolTracks.includes(t);
  const out = [{ value: '', label: 'Toute l’école' }];
  if (has('GENERAL')) out.push({ value: 'GENERAL', label: 'Enseignement général' });
  if (has('TECHNIQUE')) out.push({ value: 'TECHNIQUE', label: 'Enseignement technique' });
  if (has('PROFESSIONNEL')) out.push({ value: 'PROFESSIONNEL', label: 'Formation professionnelle' });
  if (has('TECHNIQUE') && has('PROFESSIONNEL')) {
    out.push({ value: 'TECHNIQUE+PROFESSIONNEL', label: 'Technique et professionnelle' });
  }
  return out;
}

const ALL_TRACKS: readonly EducationTrack[] = ['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'];

/** « TECHNIQUE+PROFESSIONNEL » (formulaire) -> liste d'ordres ; vide -> null (toute l'école). */
export function parseTracks(value: string | null | undefined): EducationTrack[] | null {
  const parts = (value ?? '')
    .split('+')
    .map((p) => p.trim())
    .filter((p): p is EducationTrack => (ALL_TRACKS as readonly string[]).includes(p));
  return parts.length > 0 ? parts : null;
}

/** Liste d'ordres -> valeur du formulaire. */
export function formatTracks(tracks: readonly string[] | null | undefined): string {
  return (tracks ?? []).join('+');
}

/**
 * L'ordre « principal » d'un établissement : celui dont le découpage sert de
 * référence quand un écran ne parle pas d'une classe précise (tableau de bord).
 * Le général l'emporte quand il existe — c'est le plus courant et le plus
 * lisible ; sinon on prend le technique, puis le professionnel.
 */
export function mainTrack(schoolTracks: readonly string[]): EducationTrack {
  if (schoolTracks.length === 0 || schoolTracks.includes('GENERAL')) return 'GENERAL';
  return schoolTracks.includes('TECHNIQUE') ? 'TECHNIQUE' : 'PROFESSIONNEL';
}
