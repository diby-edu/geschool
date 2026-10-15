/**
 * Moyenne annuelle d'un élève à qui il manque des périodes (arrivé en cours
 * d'année). Le choix appartient à chaque établissement :
 *
 *  - ATTENDED        : on calcule sur les périodes faites dans l'établissement ;
 *  - PREVIOUS_SCHOOL : on prend les moyennes de son ancienne école pour les
 *                      périodes manquantes ; s'il en manque encore, pas de
 *                      moyenne annuelle (jamais une moyenne amputée en silence).
 *
 * Module pur : le bulletin et la matrice du conseil appellent la même règle.
 */
export type NewcomerAnnualMode = 'ATTENDED' | 'PREVIOUS_SCHOOL';

export const NEWCOMER_MODES: NewcomerAnnualMode[] = ['ATTENDED', 'PREVIOUS_SCHOOL'];

export const NEWCOMER_LABEL: Record<NewcomerAnnualMode, string> = {
  ATTENDED: 'Calculer sur les périodes faites dans l’établissement',
  PREVIOUS_SCHOOL: 'Saisir les moyennes de son ancienne école pour les périodes manquantes',
};

export type AnnualPart = {
  /** Moyenne imprimée (ou calculée) chez nous ; null si l'élève n'était pas là. */
  value: number | null;
  /** Moyenne de l'ancienne école pour cette période, si elle a été saisie. */
  previousSchool: number | null;
  weight: number;
};

/**
 * La valeur retenue pour une période, selon le mode : la nôtre d'abord ;
 * sinon celle de l'ancienne école (mode PREVIOUS_SCHOOL seulement).
 */
export function periodValue(p: AnnualPart, mode: NewcomerAnnualMode): number | null {
  if (p.value !== null) return p.value;
  return mode === 'PREVIOUS_SCHOOL' ? p.previousSchool : null;
}

export function annualFrom(
  previous: readonly AnnualPart[],
  current: { value: number | null; weight: number },
  mode: NewcomerAnnualMode,
  round: (n: number) => number,
): number | null {
  if (current.value === null) return null;
  let points = current.value * current.weight;
  let weights = current.weight;
  for (const p of previous) {
    const v = periodValue(p, mode);
    if (v === null) {
      if (mode === 'ATTENDED') continue; // période non faite chez nous : on l'écarte
      return null; // ancienne école non saisie : pas de moyenne annuelle
    }
    points += v * p.weight;
    weights += p.weight;
  }
  return weights > 0 ? round(points / weights) : null;
}
