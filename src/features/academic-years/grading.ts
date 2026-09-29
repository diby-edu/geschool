/**
 * Fenetre de calcul des moyennes d'une periode (migration 0056) : meme regle que
 * `app.grading_is_open` en base. Ouverture / fermeture MANUELLES d'abord ; sinon les
 * dates configurees (fermeture automatique a la date de fin). Fonction pure, pour
 * l'affichage : la base reste la seule autorite (elle refuse la saisie hors fenetre).
 */
export type GradingWindow = {
  grading_starts_on: string | null;
  grading_ends_on: string | null;
  grading_override: string | null;
};

export type GradingState = {
  open: boolean;
  /** Ce qui decide : la direction (manuel), les dates, ou rien de configure. */
  source: 'manual' | 'dates' | 'none';
};

export function gradingState(w: GradingWindow, today: string): GradingState {
  if (w.grading_override === 'OPEN') return { open: true, source: 'manual' };
  if (w.grading_override === 'CLOSED') return { open: false, source: 'manual' };
  if (!w.grading_starts_on || !w.grading_ends_on) return { open: false, source: 'none' };
  return { open: today >= w.grading_starts_on && today <= w.grading_ends_on, source: 'dates' };
}
