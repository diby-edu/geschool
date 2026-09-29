/**
 * Les façons de quitter un établissement en cours d'année.
 *
 * Module neutre — ni serveur, ni client : les formulaires en ont besoin et ne
 * peuvent pas importer le service, qui parle à la base.
 *
 * Les trois valeurs existaient dans la base depuis l'origine
 * (`enrollment_status`), et rien dans l'application ne les écrivait : un élève
 * inscrit le restait pour toujours.
 */
export const LEAVE_STATUSES = ['TRANSFERRED_OUT', 'WITHDRAWN', 'COMPLETED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_REASONS: Record<LeaveStatus, string> = {
  TRANSFERRED_OUT: 'Transféré dans un autre établissement',
  WITHDRAWN: 'Retiré par la famille',
  COMPLETED: 'Scolarité achevée',
};

export const LEAVE_HINTS: Record<LeaveStatus, string> = {
  TRANSFERRED_OUT: 'Il poursuit sa scolarité ailleurs.',
  WITHDRAWN: 'Abandon, exclusion, déménagement — tout départ qui n’est pas un transfert.',
  COMPLETED: 'Il a terminé son cycle dans l’établissement.',
};

export function readLeaveStatus(value: unknown): LeaveStatus | null {
  return (LEAVE_STATUSES as readonly string[]).includes(String(value)) ? (value as LeaveStatus) : null;
}

/** Ce qu'affiche une fiche : « Inscrit », ou la raison du départ. */
export function enrollmentStatusLabel(status: string): string {
  if (status === 'ENROLLED') return 'Inscrit';
  return LEAVE_REASONS[status as LeaveStatus] ?? status;
}
