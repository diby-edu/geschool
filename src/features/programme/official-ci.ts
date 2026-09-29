/**
 * Grille officielle — enseignement secondaire général de Côte d'Ivoire, premier
 * et second cycle. Deux documents réunis ici :
 *   « Coefficients du 1er et du 2nd cycle »
 *   « Horaires des 1er et 2nd cycles »
 *
 * C'est un POINT DE DÉPART : l'établissement la charge en un clic (Matières),
 * puis modifie librement matières, coefficients et volumes. Rien n'est imposé.
 *
 * Choix de transcription :
 *  - Une série = un niveau (« 1ère C », « Tle D ») : coefficient et volume
 *    dépendent de la série, et le programme se règle par niveau.
 *  - Série A : le document distingue A1 et A2 en 1ère et en Terminale ; la
 *    2nde A n'est pas scindée.
 *  - Français : UNE matière. Le document des coefficients la détaille en trois
 *    disciplines notées séparément (expression orale et lecture, orthographe et
 *    grammaire, expression écrite) mais en donne lui-même le « Total Français »,
 *    et le document des horaires n'a qu'une ligne Français. C'est donc ce total
 *    qui est retenu, avec son volume. Le détail des trois notes appartient au
 *    bulletin, pas au programme.
 *  - « 1 Fac » (LV2 en 1ère et Tle C et D) : matière FACULTATIVE.
 *  - « -- » : matière absente du programme du niveau.
 *
 * LE VOLUME EST COMPTÉ EN SÉANCES, pas en heures d'horloge. Le document écrit
 * « Français 5 » : cinq séances par semaine. Une séance dure ce que dure un
 * créneau de l'établissement — 55 min ici, 60 ailleurs. La conversion en minutes
 * se fait au chargement, contre la grille horaire de l'école.
 *
 * Les demi-séances du document (« 0 + (1h30) », « 1 + 2h30 + (2h) ») sont
 * arrondies à la séance supérieure : on ne place pas une demi-séance dans un
 * emploi du temps. D'où des totaux parfois supérieurs d'une séance à la ligne
 * TOTAL du document — les tests le vérifient niveau par niveau.
 */

export type OfficialCycle = { code: string; name: string; sequence: number };
export type OfficialLevel = { code: string; name: string; cycle: string; sequence: number };
export type OfficialSubject = { code: string; name: string; shortName: string; category?: string };
/**
 * Une matière au programme d'un niveau.
 *  `coefficient` — poids dans la moyenne.
 *  `sessions`    — séances hebdomadaires (0 = matière notée mais non enseignée,
 *                  comme la Conduite).
 *  `optional`    — matière facultative.
 */
export type OfficialEntry = { coefficient: number; sessions: number; optional?: boolean };

export const OFFICIAL_CI_CYCLES: OfficialCycle[] = [
  { code: 'CYCLE1', name: 'Premier cycle', sequence: 1 },
  { code: 'CYCLE2', name: 'Second cycle', sequence: 2 },
];

export const OFFICIAL_CI_LEVELS: OfficialLevel[] = [
  { code: '6E', name: '6ème', cycle: 'CYCLE1', sequence: 1 },
  { code: '5E', name: '5ème', cycle: 'CYCLE1', sequence: 2 },
  { code: '4E', name: '4ème', cycle: 'CYCLE1', sequence: 3 },
  { code: '3E', name: '3ème', cycle: 'CYCLE1', sequence: 4 },
  { code: '2NDE-A', name: '2nde A', cycle: 'CYCLE2', sequence: 5 },
  { code: '2NDE-C', name: '2nde C', cycle: 'CYCLE2', sequence: 6 },
  { code: '1ERE-A1', name: '1ère A1', cycle: 'CYCLE2', sequence: 7 },
  { code: '1ERE-A2', name: '1ère A2', cycle: 'CYCLE2', sequence: 8 },
  { code: '1ERE-C', name: '1ère C', cycle: 'CYCLE2', sequence: 9 },
  { code: '1ERE-D', name: '1ère D', cycle: 'CYCLE2', sequence: 10 },
  { code: 'TLE-A1', name: 'Terminale A1', cycle: 'CYCLE2', sequence: 11 },
  { code: 'TLE-A2', name: 'Terminale A2', cycle: 'CYCLE2', sequence: 12 },
  { code: 'TLE-C', name: 'Terminale C', cycle: 'CYCLE2', sequence: 13 },
  { code: 'TLE-D', name: 'Terminale D', cycle: 'CYCLE2', sequence: 14 },
];

export const OFFICIAL_CI_SUBJECTS: OfficialSubject[] = [
  { code: 'ANG', name: 'Anglais', shortName: 'Anglais' },
  { code: 'ARTS', name: 'Arts plastiques / Éducation musicale', shortName: 'Arts / Musique' },
  { code: 'EDHC', name: "Éducation aux droits de l'homme et à la citoyenneté", shortName: 'EDHC' },
  { code: 'EPS', name: 'Éducation physique et sportive', shortName: 'EPS' },
  { code: 'FR', name: 'Français', shortName: 'Français' },
  { code: 'HG', name: 'Histoire-Géographie', shortName: 'Hist.-Géo.' },
  { code: 'LV2', name: 'LV2 (Allemand / Espagnol)', shortName: 'LV2' },
  { code: 'MATH', name: 'Mathématiques', shortName: 'Maths' },
  { code: 'TICE', name: "Technologies de l'information et de la communication (TICE)", shortName: 'TICE' },
  { code: 'PHILO', name: 'Philosophie', shortName: 'Philo' },
  { code: 'PC', name: 'Physique-Chimie', shortName: 'PC' },
  { code: 'SVT', name: 'Sciences de la vie et de la Terre', shortName: 'SVT' },
  { code: 'COND', name: 'Conduite', shortName: 'Conduite' },
];

/** `e(coefficient, séances)` ; `fac` pour une matière facultative. */
const e = (coefficient: number, sessions: number): OfficialEntry => ({ coefficient, sessions });
const fac = (coefficient: number, sessions: number): OfficialEntry => ({ coefficient, sessions, optional: true });

/** La Conduite est notée mais ne s'enseigne pas : aucune séance à placer. */
const CONDUITE = e(1, 0);

/** Premier cycle : 6ème et 5ème identiques ; 4ème et 3ème ne diffèrent que par l'histoire-géo. */
const SIXIEME_CINQUIEME: Record<string, OfficialEntry> = {
  ANG: e(2, 3), ARTS: e(1, 1), EDHC: e(1, 1), EPS: e(1, 2), FR: e(3, 5),
  HG: e(2, 2), MATH: e(3, 4), TICE: e(1, 1), PC: e(2, 2), SVT: e(2, 2), COND: CONDUITE,
};
const QUATRIEME_TROISIEME: Record<string, OfficialEntry> = {
  ANG: e(2, 3), ARTS: e(1, 1), EDHC: e(1, 1), EPS: e(1, 2), FR: e(4, 6),
  HG: e(2, 3), LV2: e(1, 3), MATH: e(3, 4), TICE: e(1, 1), PC: e(2, 2), SVT: e(2, 2), COND: CONDUITE,
};

/** 1ère A et Tle A ne diffèrent entre A1 et A2 que par les mathématiques. */
const PREMIERE_A: Record<string, OfficialEntry> = {
  ANG: e(4, 3), ARTS: e(1, 1), EPS: e(1, 2), FR: e(4, 4), HG: e(3, 4),
  LV2: e(3, 3), PHILO: e(3, 3), PC: e(1, 2), SVT: e(1, 2), COND: CONDUITE,
};
const TERMINALE_A: Record<string, OfficialEntry> = {
  ANG: e(4, 3), ARTS: e(1, 1), EPS: e(1, 2), FR: e(4, 4), HG: e(3, 4),
  LV2: e(3, 3), PHILO: e(5, 8), SVT: e(2, 2), COND: CONDUITE,
};

/** Programme : niveau -> matière -> coefficient et séances. Une matière absente = « -- ». */
export const OFFICIAL_CI_PROGRAMME: Record<string, Record<string, OfficialEntry>> = {
  '6E': SIXIEME_CINQUIEME,
  '5E': SIXIEME_CINQUIEME,
  '4E': QUATRIEME_TROISIEME,
  '3E': { ...QUATRIEME_TROISIEME, HG: e(2, 4) },
  '2NDE-A': {
    ANG: e(3, 3), ARTS: e(1, 1), EPS: e(1, 2), FR: e(4, 4), HG: e(3, 4),
    LV2: e(3, 3), MATH: e(3, 3), PC: e(2, 4), SVT: e(2, 2), COND: CONDUITE,
  },
  '2NDE-C': {
    ANG: e(3, 3), ARTS: e(1, 1), EPS: e(1, 2), FR: e(3, 4), HG: e(2, 4),
    LV2: e(1, 3), MATH: e(5, 5), PC: e(4, 5), SVT: e(2, 2), COND: CONDUITE,
  },
  '1ERE-A1': { ...PREMIERE_A, MATH: e(3, 4) },
  '1ERE-A2': { ...PREMIERE_A, MATH: e(2, 3) },
  '1ERE-C': {
    ANG: e(2, 3), ARTS: e(1, 1), EPS: e(1, 2), FR: e(3, 3), HG: e(2, 4), LV2: fac(1, 2),
    MATH: e(5, 6), PHILO: e(2, 2), PC: e(5, 6), SVT: e(2, 2), COND: CONDUITE,
  },
  '1ERE-D': {
    ANG: e(2, 3), ARTS: e(1, 1), EPS: e(1, 2), FR: e(3, 3), HG: e(2, 4), LV2: fac(1, 2),
    MATH: e(4, 5), PHILO: e(2, 2), PC: e(4, 5), SVT: e(4, 3), COND: CONDUITE,
  },
  'TLE-A1': { ...TERMINALE_A, MATH: e(4, 5) },
  'TLE-A2': { ...TERMINALE_A, MATH: e(2, 4) },
  'TLE-C': {
    ANG: e(1, 2), ARTS: e(1, 1), EPS: e(1, 2), FR: e(3, 3), HG: e(2, 4), LV2: fac(1, 2),
    MATH: e(5, 8), PHILO: e(2, 3), PC: e(5, 6), SVT: e(2, 2), COND: CONDUITE,
  },
  'TLE-D': {
    ANG: e(1, 2), ARTS: e(1, 1), EPS: e(1, 2), FR: e(3, 3), HG: e(2, 4), LV2: fac(1, 2),
    MATH: e(4, 6), PHILO: e(2, 3), PC: e(4, 5), SVT: e(4, 5), COND: CONDUITE,
  },
};

/** Coefficient « par défaut » d'une matière : le plus fréquent dans la grille (affiché dans Matières). */
export function mostFrequentCoefficient(subjectCode: string): number {
  const counts = new Map<number, number>();
  for (const entries of Object.values(OFFICIAL_CI_PROGRAMME)) {
    const entry = entries[subjectCode];
    if (entry) counts.set(entry.coefficient, (counts.get(entry.coefficient) ?? 0) + 1);
  }
  let best = 1;
  let bestCount = 0;
  for (const [coefficient, count] of counts) {
    if (count > bestCount || (count === bestCount && coefficient < best)) {
      best = coefficient;
      bestCount = count;
    }
  }
  return best;
}
