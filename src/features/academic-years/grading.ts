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

/**
 * Fin de trimestre (migration 0110) : même règle que `app.term_phase` en base.
 * La base reste l'autorité (elle refuse) ; ceci sert à l'affichage.
 */
export type TermDates = {
  grades_stop_on: string | null;
  student_check_ends_on: string | null;
  head_check_ends_on: string | null;
};

export type TermPhase = 'OPEN' | 'STUDENT_CHECK' | 'HEAD_CHECK' | 'FROZEN';

export function termPhase(d: TermDates, today: string): TermPhase {
  if (!d.grades_stop_on || today < d.grades_stop_on) return 'OPEN';
  if (d.student_check_ends_on && today <= d.student_check_ends_on) return 'STUDENT_CHECK';
  if (!d.head_check_ends_on || today <= d.head_check_ends_on) {
    return d.student_check_ends_on ? 'HEAD_CHECK' : 'STUDENT_CHECK';
  }
  return 'FROZEN';
}

export const TERM_PHASE_LABEL: Record<TermPhase, string> = {
  OPEN: 'Saisie des notes',
  STUDENT_CHECK: 'Vérification avec les élèves',
  HEAD_CHECK: 'Vérification du professeur principal',
  FROZEN: 'Notes figées',
};

/** « 1er déc. 2026 » */
export function frShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Ce que le professeur doit lire, selon l'étape. */
export function termPhaseMessage(d: TermDates, today: string): string | null {
  const phase = termPhase(d, today);
  if (phase === 'OPEN') {
    return d.grades_stop_on ? `Arrêt des notes le ${frShortDate(d.grades_stop_on)}.` : null;
  }
  if (phase === 'FROZEN') return 'Les notes de cette période sont figées : la vérification est terminée.';
  const until = d.head_check_ends_on ?? d.student_check_ends_on;
  return (
    'Arrêt des notes : plus de nouvelle évaluation. ' +
    (until ? `Vous pouvez corriger vos notes jusqu’au ${frShortDate(until)}.` : 'Vous pouvez encore corriger vos notes.')
  );
}
