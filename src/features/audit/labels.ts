/**
 * Libellés du journal d'audit. Le journal enregistre des codes techniques
 * (`reports.sign_batch`) ; l'écran les traduit en français. Un code inconnu
 * s'affiche tel quel : un nouvel événement n'est jamais caché faute de libellé.
 */

export const MODULE_LABELS: Record<string, string> = {
  academic_years: 'Années scolaires',
  access: 'Accès',
  ai: 'Assistant',
  announcements: 'Annonces',
  assessments: 'Évaluations',
  assignments: 'Affectations',
  attendance: 'Présences',
  billing: 'Abonnement',
  classes: 'Classes',
  grades: 'Notes',
  grading: 'Notation',
  onboarding: 'Inscription',
  platform: 'Plateforme',
  programme: 'Programme',
  reports: 'Bulletins',
  roles: 'Rôles et droits',
  rooms: 'Salles',
  schedule: 'Emploi du temps',
  settings: 'Paramètres',
  staff: 'Personnel',
  students: 'Élèves',
  subjects: 'Matières',
  teachers: 'Enseignants',
};

export const ACTION_LABELS: Record<string, string> = {
  'academic_years.activate': 'Année scolaire activée',
  'academic_years.create': 'Année scolaire créée',
  'academic_years.official_calendar': 'Calendrier officiel appliqué',
  'academic_periods.create': 'Période ajoutée',
  'academic_periods.delete': 'Période supprimée',
  'calendar_events.create': 'Congé ou jour férié ajouté',
  'calendar_events.delete': 'Congé ou jour férié supprimé',
  'calendar_events.update': 'Congé ou jour férié modifié',
  'academic_periods.update': 'Période modifiée',
  'academic_periods.grading_window': 'Dates de la période de calcul modifiées',
  'academic_periods.grading_override': 'Période de calcul ouverte ou fermée à la main',
  'grading.complete': 'Moyennes marquées terminées',
  'grading.reopen': 'Moyennes rouvertes',
  'access.reactivate': 'Accès réactivé',
  'access.reveal_temporary_password': 'Mot de passe temporaire remis en main propre',
  'access.suspend': 'Accès suspendu',
  'ai.appreciation_save': 'Appréciation enregistrée',
  'announcements.create': 'Annonce rédigée',
  'announcements.publish': 'Annonce publiée',
  'assessments.close': 'Évaluation clôturée',
  'assessments.create': 'Évaluation créée',
  'assessments.delete': 'Évaluation supprimée',
  'assessments.publish': 'Évaluation publiée',
  'assessments.reopen': 'Évaluation rouverte',
  'assessments.update': 'Évaluation modifiée',
  'assignments.create': 'Affectation créée',
  'attendance.gap_clear': 'Qualification d’un appel non fait retirée',
  'attendance.gap_qualify': 'Appel non fait qualifié',
  'attendance.justify_decide': 'Justificatif d’absence traité',
  'attendance.justify_submit': 'Justificatif d’absence déposé',
  'attendance.save': 'Appel enregistré',
  'attendance.submit': 'Appel soumis',
  'billing.payment_record': 'Paiement enregistré',
  'billing.payment_declare': 'Paiement déclaré',
  'billing.payment_confirm': 'Paiement confirmé',
  'billing.payment_reject': 'Paiement refusé',
  'classes.create': 'Classe créée',
  'grades.save': 'Notes enregistrées',
  'grading.seed_defaults': 'Barème par défaut installé',
  'onboarding.self_register': 'Établissement inscrit',
  'platform.school_enter': 'Espace ouvert par la plateforme (support)',
  'platform.schools.create': 'Établissement créé par la plateforme',
  'programme.upsert': 'Programme modifié',
  'programme.apply_official': 'Grille officielle chargée',
  'reports.generate': 'Bulletins générés',
  'reports.publish_batch': 'Bulletins publiés',
  'reports.sign_batch': 'Bulletins signés',
  'reports.unpublish_batch': 'Bulletins dépubliés',
  'reports.validate_batch': 'Bulletins validés',
  'roles.customize': 'Fonctions de l’établissement personnalisées',
  'roles.permissions.reset': 'Droits d’une fonction rétablis',
  'roles.permissions.update': 'Droits d’une fonction modifiés',
  'rooms.create': 'Salle créée',
  'rooms.type_create': 'Type de salle créé',
  'schedule.config': 'Grille horaire réglée',
  'schedule.generate': 'Emploi du temps généré',
  'schedule.generate_infeasible': 'Génération impossible (contraintes)',
  'schedule.publish': 'Emploi du temps publié',
  'schedule.requirement_update': 'Besoin horaire modifié',
  'schedule.requirements_sync': 'Besoins horaires synchronisés',
  'schedule.version_create': 'Version d’emploi du temps créée',
  'settings.identity_update': 'Identité de l’école modifiée',
  'staff.create': 'Membre du personnel ajouté',
  'staff.functions': 'Fonctions d’une personne modifiées',
  'staff.update': 'Fiche du personnel modifiée',
  'students.enroll': 'Élève inscrit',
  'students.export': 'Liste des élèves exportée',
  'rooms.export': 'Liste des salles exportée',
  'classes.export': 'Liste des classes exportée',
  'teachers.export': 'Liste des enseignants exportée',
  'staff.export': 'Liste du personnel exportée',
  'subjects.create': 'Matière créée',
  'teachers.create_access': 'Accès enseignant créé',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

/** Résumé lisible des données jointes à un événement (au plus 3 valeurs simples). */
export function summarize(after: unknown): string {
  if (!after || typeof after !== 'object' || Array.isArray(after)) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(after as Record<string, unknown>)) {
    if (parts.length === 3) break;
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'object') {
      if (Array.isArray(value)) parts.push(`${key} : ${value.slice(0, 3).join(', ')}${value.length > 3 ? '…' : ''}`);
      continue;
    }
    parts.push(`${key} : ${String(value).slice(0, 60)}`);
  }
  return parts.join(' · ');
}
