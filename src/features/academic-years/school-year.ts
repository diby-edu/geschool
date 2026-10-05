/**
 * L'annee scolaire se deduit, elle ne se saisit pas.
 *
 * Une annee scolaire ivoirienne porte le nom de ses deux millesimes —
 * « 2026-2027 » — et rien d'autre. Demander ce nom a l'ecole, c'est demander
 * de recopier ce que la date dit deja, et s'exposer a « 2026/2027 »,
 * « 2026 - 2027 » ou « Annee 2026 » dans la meme base.
 *
 * Module NEUTRE : utilisable depuis un composant client comme depuis un test.
 */

/** Mois (1-12) a partir duquel la rentree d'une nouvelle annee a eu lieu. */
export const RENTREE_MOIS = 8; // aout

/**
 * L'annee de rentree correspondant a une date.
 *
 * Au 4 octobre 2026, l'annee en cours est 2026-2027, donc 2026.
 * Au 4 mars 2027, c'est encore 2026-2027, donc 2026.
 */
export function schoolYearFor(date = new Date()): number {
  return date.getMonth() + 1 >= RENTREE_MOIS ? date.getFullYear() : date.getFullYear() - 1;
}

/** « 2026-2027 ». */
export function yearName(startYear: number): string {
  return `${startYear}-${startYear + 1}`;
}

/**
 * Dates par defaut : du 1er septembre au 31 juillet.
 *
 * Un simple point de depart — l'ecole les corrige si son calendrier differe.
 * Rien de pedagogique n'est fige ici.
 */
export function defaultDates(startYear: number): { startsOn: string; endsOn: string } {
  return { startsOn: `${startYear}-09-01`, endsOn: `${startYear + 1}-07-31` };
}

export type SuggestedYear = {
  startYear: number;
  name: string;
  startsOn: string;
  endsOn: string;
  /** Celle que l'ecole vit en ce moment. */
  current: boolean;
  /** « L'an dernier », « Cette annee », « L'an prochain ». */
  hint: string;
};

/**
 * Les trois annees qu'une ecole a sous la main : la precedente, celle en
 * cours, la suivante.
 *
 * La precedente sert aux etablissements qui reprennent un historique ; la
 * suivante sert des la periode des reinscriptions, qui commence avant la fin
 * de l'annee en cours.
 */
export function suggestedYears(date = new Date()): SuggestedYear[] {
  const courante = schoolYearFor(date);
  const hints: Record<number, string> = {
    [-1]: 'L’an dernier',
    [0]: 'Cette année',
    [1]: 'L’an prochain',
  };
  return [-1, 0, 1].map((decalage) => {
    const startYear = courante + decalage;
    return {
      startYear,
      name: yearName(startYear),
      ...defaultDates(startYear),
      current: decalage === 0,
      hint: hints[decalage] ?? '',
    };
  });
}

/** Le nom qu'on retient a partir de la date de debut saisie. */
export function nameFromStart(startsOn: string): string | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(startsOn);
  if (!m) return null;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  return yearName(mois >= RENTREE_MOIS ? annee : annee - 1);
}
