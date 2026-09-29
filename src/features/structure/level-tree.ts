import { TRACK_LABELS, type EducationTrack } from './official-tracks';

/**
 * Rangement des niveaux pour l'écran Structure : un groupe par ordre
 * d'enseignement — général, puis technique, puis professionnel — et, dans le
 * professionnel, un sous-groupe par diplôme (BT, CAP, BEP, CQP, FQ).
 *
 * Un établissement complet peut avoir plus de cinquante niveaux : les groupes
 * s'affichent repliés, on n'ouvre que celui qu'on cherche.
 */

export type LevelLike = {
  id: string;
  name: string;
  code: string;
  track?: string | null;
  diploma?: string | null;
  sequence?: number | null;
};

export type LevelSubGroup<T> = { key: string; label: string | null; levels: T[] };
export type LevelGroup<T> = { track: EducationTrack; label: string; total: number; subs: LevelSubGroup<T>[] };

const TRACK_ORDER: EducationTrack[] = ['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'];
/** Ordre des diplômes du plus court au plus long, comme au ministère. */
const DIPLOMA_ORDER = ['CQP', 'FQ', 'CAP', 'BEP', 'BT'];

const trackOf = (l: LevelLike): EducationTrack =>
  l.track === 'TECHNIQUE' || l.track === 'PROFESSIONNEL' ? l.track : 'GENERAL';

export function groupLevels<T extends LevelLike>(levels: readonly T[]): LevelGroup<T>[] {
  const groups: LevelGroup<T>[] = [];

  for (const track of TRACK_ORDER) {
    const mine = levels.filter((l) => trackOf(l) === track);
    if (mine.length === 0) continue;

    // Seul le professionnel se range par diplôme : ailleurs, une seule liste.
    const subs: LevelSubGroup<T>[] =
      track === 'PROFESSIONNEL'
        ? diplomaKeys(mine).map((key) => ({
            key,
            label: key === 'AUTRES' ? 'Autres' : key,
            levels: mine.filter((l) => (l.diploma ?? 'AUTRES') === key),
          }))
        : [{ key: 'tous', label: null, levels: mine }];

    groups.push({ track, label: TRACK_LABELS[track], total: mine.length, subs });
  }
  return groups;
}

function diplomaKeys(levels: readonly LevelLike[]): string[] {
  const present = new Set(levels.map((l) => l.diploma ?? 'AUTRES'));
  const known = DIPLOMA_ORDER.filter((d) => present.has(d));
  const others = [...present].filter((d) => d !== 'AUTRES' && !DIPLOMA_ORDER.includes(d)).sort();
  return [...known, ...others, ...(present.has('AUTRES') ? ['AUTRES'] : [])];
}

/**
 * Code court d'un niveau, proposé pendant la saisie : « Terminale D » → « TLE-D ».
 * Même règle que les niveaux officiels, pour que les codes se ressemblent tous.
 * Il reste modifiable : c'est lui qu'on retrouve dans les imports et les exports.
 */
const SHORTCUTS: [RegExp, string][] = [
  [/\bTERMINALES?\b/g, 'TLE'],
  [/\bPREMIERES?\b/g, '1ERE'],
  [/\bSECONDES?\b/g, '2NDE'],
  [/\bTROISIEMES?\b/g, '3E'],
  [/\bQUATRIEMES?\b/g, '4E'],
  [/\bCINQUIEMES?\b/g, '5E'],
  [/\bSIXIEMES?\b/g, '6E'],
];

export function suggestLevelCode(name: string): string {
  let base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  for (const [from, to] of SHORTCUTS) base = base.replace(from, to);
  return base.replace(/\s+/g, '-').slice(0, 20);
}
