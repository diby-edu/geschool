/**
 * Les règles de présence de l'établissement.
 *
 * Trois décisions, et trois seulement — tout le reste est fixé par le
 * fonctionnement lui-même : l'appel se fait par l'enseignant, pendant le
 * créneau, et une absence se justifie jusqu'à la clôture de la période.
 *
 * Module NEUTRE : le formulaire est un composant client.
 */

export const ALERT_RECIPIENTS = ['PARENT', 'SUPERVISOR', 'HEAD_TEACHER', 'DIRECTOR'] as const;
export type AlertRecipient = (typeof ALERT_RECIPIENTS)[number];

export const RECIPIENT_LABELS: Record<AlertRecipient, { title: string; hint: string }> = {
  PARENT: { title: 'Le parent', hint: 'Dans son tableau de bord, sans frais.' },
  SUPERVISOR: { title: 'L’éducateur de la classe', hint: 'Celui qui suit la vie scolaire au quotidien.' },
  HEAD_TEACHER: { title: 'Le professeur principal', hint: 'Pour qu’il en parle au conseil.' },
  DIRECTOR: { title: 'Le chef d’établissement', hint: 'Réservez-le aux cas lourds, sinon il reçoit tout.' },
};

export type AttendancePolicy = {
  /** Heures d'absence cumulées sur la période avant qu'une alerte parte. 0 = jamais. */
  alertAfterHours: number;
  /** Qui reçoit l'alerte, dans son tableau de bord. */
  alertRecipients: AlertRecipient[];
  /** Envoyer aussi un SMS au parent — coûte de l'argent, donc décoché par défaut. */
  alertBySms: boolean;
  /** Heures d'absence NON JUSTIFIÉES avant de convoquer la famille. 0 = jamais. */
  summonAfterUnjustifiedHours: number;
};

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = {
  alertAfterHours: 6,
  alertRecipients: ['PARENT', 'SUPERVISOR'],
  alertBySms: false,
  summonAfterUnjustifiedHours: 12,
};

export function policyProblem(p: AttendancePolicy): string | null {
  if (!Number.isFinite(p.alertAfterHours) || p.alertAfterHours < 0 || p.alertAfterHours > 500) {
    return 'Le seuil d’alerte doit être compris entre 0 et 500 heures.';
  }
  if (
    !Number.isFinite(p.summonAfterUnjustifiedHours) ||
    p.summonAfterUnjustifiedHours < 0 ||
    p.summonAfterUnjustifiedHours > 500
  ) {
    return 'Le seuil de convocation doit être compris entre 0 et 500 heures.';
  }
  if (p.alertAfterHours > 0 && p.alertRecipients.length === 0) {
    return 'Choisissez au moins un destinataire, sinon l’alerte ne partirait nulle part.';
  }
  // Convoquer avant même d'avoir alerté prendrait la famille de court.
  if (p.summonAfterUnjustifiedHours > 0 && p.alertAfterHours > 0 && p.summonAfterUnjustifiedHours < p.alertAfterHours) {
    return 'La convocation doit venir après l’alerte, pas avant : relevez son seuil.';
  }
  return null;
}
