/**
 * Qui peut agir sur UNE évaluation : son propriétaire, ou le détenteur de la
 * permission GÉNÉRALE (toute l'école) correspondante.
 *
 * Miroir applicatif des policies de 0021 (« propriétaire OU app.can_write(école,
 * '<permission générale>') »). Le rôle Enseignant ne détient plus ces permissions
 * générales (0051) : sans cette règle, il ne pourrait plus modifier ses propres
 * évaluations ni y saisir de notes. La RLS reste la vraie barrière ; ceci évite
 * d'afficher des boutons voués au refus et de laisser passer un UPDATE que la
 * base ignorerait silencieusement (0 ligne, sans erreur).
 *
 * Module sans dépendance serveur : la décision est testable seule.
 */

export type AssessmentAction = 'update' | 'delete' | 'grade';

/** Permission générale qui ouvre chaque action sur l'évaluation d'un collègue. */
export const GENERAL_PERMISSION: Record<AssessmentAction, string> = {
  update: 'assessments.update',
  delete: 'assessments.delete',
  grade: 'grades.create',
};

export function isAssessmentActionAllowed(input: {
  /** Détient la permission générale de l'action (ou est Super Admin). */
  general: boolean;
  /** `teacher_id` de l'évaluation ; null si elle n'a pas d'enseignant. */
  assessmentTeacherId: string | null;
  /** Fiche enseignant de l'utilisateur ; null s'il n'en a pas. */
  myTeacherId: string | null;
}): boolean {
  if (input.general) return true;
  // Deux « rien » ne font pas un propriétaire : un membre sans fiche enseignant
  // n'est pas propriétaire d'une évaluation sans enseignant.
  if (input.assessmentTeacherId === null || input.myTeacherId === null) return false;
  return input.assessmentTeacherId === input.myTeacherId;
}
