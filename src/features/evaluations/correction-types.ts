/**
 * Types d'affichage des corrections de notes.
 *
 * Module NEUTRE : les écrans de réponse sont des composants client, et
 * `corrections.ts` est `server-only`.
 */

export const CORRECTION_STATUSES = ['PENDING', 'ACCEPTED', 'REFUSED', 'APPLIED_WITHOUT_CONSENT'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

export const CORRECTION_LABELS: Record<CorrectionStatus, string> = {
  PENDING: 'En attente de l’enseignant',
  ACCEPTED: 'Acceptée par l’enseignant',
  REFUSED: 'Refusée par l’enseignant',
  APPLIED_WITHOUT_CONSENT: 'Appliquée sans l’accord de l’enseignant',
};

export const CORRECTION_TONES: Record<CorrectionStatus, 'info' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'info',
  ACCEPTED: 'success',
  REFUSED: 'warning',
  APPLIED_WITHOUT_CONSENT: 'danger',
};

export type CorrectionRow = {
  id: string;
  status: CorrectionStatus;
  student: string;
  matricule: string;
  subject: string;
  klass: string;
  assessment: string;
  teacher: string;
  teacherId: string | null;
  /**
   * L'enseignant a-t-il un compte pour répondre ? Beaucoup n'en ont pas encore
   * au démarrage. Sans compte, la demande ne peut pas aboutir seule : il faut
   * le dire, sinon elle attendrait indéfiniment une réponse impossible.
   */
  teacherHasAccount: boolean;
  /** Valeurs déjà mises en forme : « 15,50 » ou « Absent ». */
  before: string;
  after: string;
  reason: string;
  decisionReason: string | null;
  requestedAt: string;
  decidedAt: string | null;
  /** L'utilisateur connecté est-il l'enseignant à qui la demande s'adresse ? */
  isMine: boolean;
};
