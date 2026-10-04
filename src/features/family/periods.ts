/**
 * Quelle periode montrer a un parent qui arrive sur « Mes notes » ?
 *
 * Pas forcement la premiere de l'annee, ni la derniere : celle qu'on est en
 * train de vivre. Et pendant les vacances, celle qui vient de s'achever —
 * c'est la que sont les dernieres notes. Une periode demandee dans l'URL prime,
 * a condition qu'elle existe pour CET enfant : le technique et le professionnel
 * sont en semestres quand le general est en trimestres, et un identifiant de
 * trimestre n'a aucun sens pour un eleve de BT.
 *
 * Pure a dessein : c'est la seule regle de la page qui merite d'etre verifiee.
 */

export type PeriodLike = { id: string; starts_on: string | null; ends_on: string | null; sequence: number };

export function pickPeriod<T extends PeriodLike>(periods: readonly T[], wanted: string | undefined, today: string): T | null {
  if (periods.length === 0) return null;

  const demandee = periods.find((p) => p.id === wanted);
  if (demandee) return demandee;

  const encours = periods.find((p) => (p.starts_on ?? '') <= today && today <= (p.ends_on ?? '9999-12-31'));
  if (encours) return encours;

  // Hors periode : la derniere achevee, sinon la prochaine a venir.
  const achevees = periods.filter((p) => (p.ends_on ?? '') < today);
  if (achevees.length > 0) {
    return achevees.reduce((a, b) => ((a.ends_on ?? '') >= (b.ends_on ?? '') ? a : b));
  }
  return [...periods].sort((a, b) => a.sequence - b.sequence)[0]!;
}
