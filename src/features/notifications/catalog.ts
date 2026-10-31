/**
 * Les types de notifications (maquette docs/maquettes/alertes-et-notifications.html,
 * migration 0171). Chacun dit à qui il s'adresse et comment on le présente ;
 * la cloche, les réglages du téléphone et l'envoi s'en servent.
 *
 * Qui le reçoit vraiment se décide à l'envoi, par les droits cochés pour la
 * fonction (« droit coché = messages reçus ») : ce catalogue ne fait que
 * l'expliquer à l'écran.
 */

export type NotificationAudience = 'staff' | 'teacher' | 'parent' | 'platform' | 'all';

export type NotificationKind = {
  label: string;
  icon: string;
  audience: NotificationAudience;
  /** Pour qui, en clair (réglages). */
  who: string;
  /** Lien par défaut, sous l'école (« /attendance/justificatifs »). */
  href?: string;
};

export const NOTIFICATION_TYPES = {
  // Écoles — personnel, selon les droits.
  'justification.submitted': { label: 'Justificatif d’absence déposé', icon: '📎', audience: 'staff', who: 'Qui peut justifier les absences', href: '/attendance/justificatifs' },
  attendance_alert: { label: 'Élève au-delà du seuil d’absences', icon: '⚠️', audience: 'staff', who: 'Vie scolaire', href: '/attendance/absences' },
  attendance_summons: { label: 'Convocation après absences', icon: '📣', audience: 'staff', who: 'Vie scolaire', href: '/attendance/absences' },
  'reports.ready': { label: 'Bulletins prêts à publier', icon: '📄', audience: 'staff', who: 'Qui peut publier les bulletins', href: '/bulletins' },
  'billing.payment': { label: 'Paiement reçu', icon: '💳', audience: 'staff', who: 'Qui suit l’abonnement', href: '/facturation' },
  grade_change_requested: { label: 'Demande de correction de note', icon: '✏️', audience: 'staff', who: 'Enseignant concerné' },
  grade_change_forced: { label: 'Note corrigée par l’administration', icon: '✏️', audience: 'teacher', who: 'Enseignant concerné' },
  grade_change_decided: { label: 'Réponse à une demande de correction', icon: '✏️', audience: 'staff', who: 'Auteur de la demande' },
  'platform.reply': { label: 'Réponse de la plateforme', icon: '💬', audience: 'staff', who: 'Auteur du message' },
  'platform.message': { label: 'Message de la plateforme', icon: '📢', audience: 'all', who: 'Destinataires choisis' },
  // Enseignants.
  'attendance.todo': { label: 'Appel à faire', icon: '✋', audience: 'teacher', who: 'Enseignant du cours', href: '/attendance' },
  'grades.closing': { label: 'Saisie des notes bientôt fermée', icon: '⏳', audience: 'teacher', who: 'Enseignants', href: '/evaluations/mine' },
  // Parents (enfant payé, Espace Parent).
  'attendance.absent': { label: 'Absence de votre enfant', icon: '🔴', audience: 'parent', who: 'Tuteurs de l’enfant', href: '/mes-absences' },
  'grades.new': { label: 'Nouvelle note', icon: '📝', audience: 'parent', who: 'Tuteurs de l’enfant', href: '/mes-notes' },
  'reports.published': { label: 'Bulletin disponible', icon: '📄', audience: 'parent', who: 'Tuteurs de l’enfant', href: '/mes-bulletins' },
  announcement: { label: 'Annonce de l’école', icon: '📣', audience: 'all', who: 'Destinataires de l’annonce', href: '/annonces' },
  // Super Admin.
  'platform.payment': { label: 'Paiement reçu', icon: '💰', audience: 'platform', who: 'Super Admin' },
  'platform.school': { label: 'Nouvelle école inscrite', icon: '🏫', audience: 'platform', who: 'Super Admin' },
  'platform.request': { label: 'Nouveau message d’une école', icon: '💬', audience: 'platform', who: 'Super Admin' },
  'platform.alert': { label: 'Alerte technique', icon: '🔴', audience: 'platform', who: 'Super Admin' },
} as const satisfies Record<string, NotificationKind>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

const FALLBACK: NotificationKind = { label: 'Notification', icon: '🔔', audience: 'all', who: '' };

export function notificationKind(type: string): NotificationKind {
  return (NOTIFICATION_TYPES as Record<string, NotificationKind>)[type] ?? FALLBACK;
}

/** Les types qu'on peut couper sur son téléphone, pour un public donné. */
export function mutableTypes(audiences: NotificationAudience[]): { type: string; kind: NotificationKind }[] {
  return Object.entries(NOTIFICATION_TYPES as Record<string, NotificationKind>)
    .filter(([, k]) => audiences.includes(k.audience) || k.audience === 'all')
    .map(([type, kind]) => ({ type, kind }));
}
