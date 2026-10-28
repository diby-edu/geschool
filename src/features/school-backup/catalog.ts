/**
 * Sauvegardes des écoles (0156, maquette docs/maquettes/ecole-sauvegardes.html) :
 * dans quelle catégorie va chaque table d'une école, et comment elle se remet.
 *
 * Toute table portant `school_id` (et les tables qui lui sont rattachées par une
 * autre) doit figurer ici, dans une catégorie ou dans NEVER : le test
 * tests/rls/sauvegardes-catalogue.test.ts échoue sinon. Une table oubliée
 * serait une donnée perdue à la remise.
 *
 * Modes :
 *   replace  — données du quotidien : remplacées par celles de la sauvegarde
 *              (ce qui n'y était pas est retiré, le reste remis à l'identique) ;
 *   add      — données de base : on recrée seulement ce qui manque ;
 *   settings — paramètres : remis à leur valeur de la sauvegarde, rien n'est retiré ;
 *   roles    — fonctions recréées si absentes, droits de chaque fonction remis.
 */

export type RestoreMode = 'replace' | 'add' | 'settings' | 'roles';

export type BackupCategory = {
  key: string;
  label: string;
  hint: string;
  mode: RestoreMode;
  tables: string[];
};

export const BACKUP_CATEGORIES: BackupCategory[] = [
  // --- Données du quotidien : remplacées ---------------------------------
  {
    key: 'notes',
    label: 'Notes',
    hint: 'avec les évaluations',
    mode: 'replace',
    tables: ['assessments', 'grades', 'grade_flags', 'grade_change_requests', 'average_completions'],
  },
  {
    key: 'presences',
    label: 'Présences et absences',
    hint: 'avec les justificatifs',
    mode: 'replace',
    tables: ['attendance_registers', 'attendance_records', 'absence_justifications', 'attendance_alerts', 'attendance_gaps'],
  },
  {
    key: 'emplois',
    label: 'Emplois du temps',
    hint: 'et les cours datés',
    mode: 'replace',
    tables: [
      'schedule_configurations',
      'schedule_versions',
      'schedule_sessions',
      'schedule_session_rooms',
      'schedule_session_targets',
      'schedule_session_teachers',
      'schedule_constraints',
      'schedule_conflicts',
      'schedule_generation_jobs',
      'session_occurrences',
    ],
  },
  {
    key: 'bulletins',
    label: 'Bulletins et conseils de classe',
    hint: 'moyennes, décisions, classes certifiées',
    mode: 'replace',
    tables: ['report_cards', 'report_card_items', 'class_councils', 'class_council_decisions', 'council_averages', 'class_term_status', 'previous_school_averages'],
  },
  { key: 'discipline', label: 'Discipline', hint: 'incidents, sanctions', mode: 'replace', tables: ['discipline_incidents', 'discipline_sanctions'] },
  { key: 'annonces', label: 'Annonces et documents', hint: '', mode: 'replace', tables: ['announcements', 'documents'] },
  {
    key: 'parametres',
    label: 'Paramètres de l’école',
    hint: 'identité, logo, réglages de chaque module, modèles de bulletin, barèmes, types d’évaluation, d’incidents, de sanctions',
    mode: 'settings',
    tables: [
      'schools',
      'school_settings',
      'school_branding_templates',
      'report_card_templates',
      'grading_scales',
      'grading_scale_bands',
      'assessment_types',
      'discipline_incident_types',
      'discipline_sanction_types',
      'document_categories',
    ],
  },
  // --- Données de base : ajout seulement ----------------------------------
  {
    key: 'eleves',
    label: 'Élèves et parents',
    hint: 'inscriptions, groupes, dispenses, transferts',
    mode: 'add',
    tables: [
      'students',
      'student_enrollments',
      'student_groups',
      'guardians',
      'student_guardians',
      'student_transfers',
      'subject_exemptions',
      'applications',
      'matricule_counters',
    ],
  },
  {
    key: 'personnel',
    label: 'Enseignants et personnel',
    hint: 'fiches, disponibilités, rattachement à l’école',
    mode: 'add',
    tables: ['teachers', 'teacher_subjects', 'teacher_availability', 'staff_profiles', 'school_memberships', 'membership_roles', 'membership_scope_grants'],
  },
  {
    key: 'structure',
    label: 'Années, classes et niveaux',
    hint: 'périodes, cycles, groupes, horaires, calendrier',
    mode: 'add',
    tables: ['academic_years', 'academic_periods', 'cycles', 'levels', 'classes', 'groups', 'group_classes', 'time_slots', 'school_calendar_events'],
  },
  {
    key: 'programme',
    label: 'Matières et programme',
    hint: 'coefficients, affectations, exigences',
    mode: 'add',
    tables: ['subjects', 'level_subjects', 'teaching_assignments', 'teaching_requirements', 'teaching_requirement_targets', 'teaching_requirement_teachers'],
  },
  {
    key: 'salles',
    label: 'Salles',
    hint: 'types, équipements, fermetures',
    mode: 'add',
    tables: ['rooms', 'room_types', 'room_features', 'room_room_features', 'room_availability', 'room_closures'],
  },
  { key: 'fonctions', label: 'Fonctions et droits', hint: 'fonctions supprimées recréées, cases remises comme dans la sauvegarde', mode: 'roles', tables: ['roles', 'role_permissions'] },
];

/**
 * Jamais sauvegardé ni remis : ce qui raconte ce qui s'est réellement passé
 * (journal, notifications, accès, envois), ce qui dépend de la plateforme
 * (abonnement, paiements, SMS, modules) et les appareils des personnes.
 */
export const NEVER: Record<string, string> = {
  audit_logs: 'journal des actions',
  notifications: 'notifications envoyées',
  notification_preferences: 'préférences de chaque personne',
  push_subscriptions: 'appareils des personnes',
  access_events: 'historique des accès',
  account_access: 'comptes de connexion',
  credential_deliveries: 'identifiants envoyés',
  credential_delivery_batches: 'envois groupés d’identifiants',
  sync_operations: 'synchronisation hors ligne',
  payments: 'paiements (plateforme)',
  payment_receipts: 'reçus (plateforme)',
  subscriptions: 'abonnement (plateforme)',
  subscription_items: 'abonnement (plateforme)',
  subscription_modules: 'abonnement (plateforme)',
  school_features: 'modules activés (abonnement)',
  sms_messages: 'SMS envoyés',
  sms_quota_grants: 'crédit SMS (plateforme)',
  usage_records: 'mesures d’usage (plateforme)',
  platform_requests: 'demandes à la plateforme',
  platform_request_messages: 'demandes à la plateforme',
  school_backups: 'les sauvegardes elles-mêmes',
};

/** Colonnes de `schools` remises avec les paramètres. Jamais : id, slug, statut, code école. */
export const SCHOOL_IDENTITY_COLUMNS = [
  'name',
  'short_name',
  'school_type',
  'logo_url',
  'favicon_url',
  'primary_color',
  'secondary_color',
  'address',
  'city',
  'region',
  'neighborhood',
  'country_code',
  'phone_e164',
  'email',
  'website',
  'director_name',
  'registration_number',
  'currency',
  'locale',
  'timezone',
  'education_tracks',
  'parent_portal_enabled',
] as const;

export const ALL_BACKUP_TABLES: string[] = BACKUP_CATEGORIES.flatMap((c) => c.tables);

export function categoryOfTable(table: string): BackupCategory | undefined {
  return BACKUP_CATEGORIES.find((c) => c.tables.includes(table));
}

/** Le format du fichier : à changer si la forme des lignes change. */
export const BACKUP_FORMAT = 'gsbak';
export const BACKUP_FORMAT_VERSION = 1;
