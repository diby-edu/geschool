/**
 * Libelles lisibles pour les entrees du journal d'audit (`audit_logs.action`),
 * partages entre le tableau de bord d'un etablissement et celui de la
 * plateforme. Une action non repertoriee retombe sur `module · action` —
 * jamais masquee, seulement moins habillee.
 */

export type ActivityTone = 'brand' | 'good' | 'warn' | 'info';

export const ACTIVITY_LABELS: Record<string, { label: string; tone: ActivityTone }> = {
  'reports.generate': { label: 'Bulletins generes', tone: 'brand' },
  'reports.validate_batch': { label: 'Bulletins valides', tone: 'good' },
  'reports.publish_batch': { label: 'Bulletins publies', tone: 'good' },
  'reports.unpublish_batch': { label: 'Bulletins depublies', tone: 'warn' },
  'schedule.generate': { label: 'Emploi du temps genere', tone: 'brand' },
  'schedule.publish': { label: 'Emploi du temps publie', tone: 'good' },
  'schedule.generate_infeasible': { label: 'Generation d’emploi du temps infaisable', tone: 'warn' },
  'attendance.submit': { label: 'Appel soumis', tone: 'info' },
  'attendance.validate': { label: 'Appel valide', tone: 'good' },
  'attendance.justify_decide': { label: 'Justificatif traite', tone: 'info' },
  'billing.payment_record': { label: 'Paiement enregistre', tone: 'good' },
  'announcements.create': { label: 'Annonce creee', tone: 'brand' },
  'announcements.publish': { label: 'Annonce publiee', tone: 'brand' },
  'access.bulk_send': { label: 'Identifiants envoyes', tone: 'info' },
  'access.reset': { label: 'Mot de passe reinitialise', tone: 'info' },
  'students.enroll': { label: 'Eleve inscrit', tone: 'good' },
  'teachers.create': { label: 'Enseignant ajoute', tone: 'good' },
  'ai.appreciation': { label: 'Appreciation IA generee', tone: 'brand' },
  'ai.appreciation_save': { label: 'Appreciation IA enregistree', tone: 'good' },
  'platform.schools.create': { label: 'Nouvel etablissement cree', tone: 'good' },
};

export function activityLabel(action: string, module: string): { label: string; tone: ActivityTone } {
  return ACTIVITY_LABELS[action] ?? { label: `${module} · ${action}`, tone: 'brand' };
}
