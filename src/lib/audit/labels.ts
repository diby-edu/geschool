/**
 * Libelles lisibles pour les entrees du journal d'audit (`audit_logs.action`),
 * partages entre le tableau de bord d'un etablissement et celui de la
 * plateforme. Une action non repertoriee ici prend le libelle du journal d'audit
 * (features/audit/labels.ts), sinon retombe sur `module · action` —
 * jamais masquee, seulement moins habillee.
 */

import { actionLabel } from '@/features/audit/labels';

export type ActivityTone = 'brand' | 'good' | 'warn' | 'info';

export const ACTIVITY_LABELS: Record<string, { label: string; tone: ActivityTone }> = {
  'reports.generate': { label: 'Bulletins générés', tone: 'brand' },
  'reports.validate_batch': { label: 'Bulletins validés', tone: 'good' },
  'reports.publish_batch': { label: 'Bulletins publiés', tone: 'good' },
  'reports.unpublish_batch': { label: 'Bulletins dépubliés', tone: 'warn' },
  'schedule.generate': { label: 'Emploi du temps généré', tone: 'brand' },
  'schedule.publish': { label: 'Emploi du temps publié', tone: 'good' },
  'schedule.generate_infeasible': { label: 'Génération d’emploi du temps infaisable', tone: 'warn' },
  'attendance.submit': { label: 'Appel soumis', tone: 'info' },
  'attendance.validate': { label: 'Appel validé', tone: 'good' },
  'attendance.justify_decide': { label: 'Justificatif traité', tone: 'info' },
  'billing.payment_record': { label: 'Paiement enregistré', tone: 'good' },
  'announcements.create': { label: 'Annonce créée', tone: 'brand' },
  'announcements.publish': { label: 'Annonce publiée', tone: 'brand' },
  'access.bulk_send': { label: 'Identifiants envoyés', tone: 'info' },
  'access.reset': { label: 'Mot de passe réinitialisé', tone: 'info' },
  'students.enroll': { label: 'Élève inscrit', tone: 'good' },
  'teachers.create': { label: 'Enseignant ajouté', tone: 'good' },
  'ai.appreciation': { label: 'Appréciation IA générée', tone: 'brand' },
  'ai.appreciation_save': { label: 'Appréciation IA enregistrée', tone: 'good' },
  'platform.schools.create': { label: 'Nouvel établissement créé', tone: 'good' },
};

export function activityLabel(action: string, module: string): { label: string; tone: ActivityTone } {
  // Hors de cette liste : le libellé du journal d'audit (Établissement inscrit…), sinon le code brut.
  const known = ACTIVITY_LABELS[action];
  if (known) return known;
  const label = actionLabel(action);
  return { label: label === action ? `${module} · ${action}` : label, tone: 'brand' };
}
