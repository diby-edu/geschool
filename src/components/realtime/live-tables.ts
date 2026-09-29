/**
 * Tables dont un changement rafraichit les ecrans en direct.
 *
 * Regle : on publie le moment ou une information est VALIDEE, pas chaque ligne
 * saisie. Les notes (`grades`, plusieurs centaines de milliers de lignes) et les
 * pointages (`attendance_records`) ne sont donc pas ici : la validation se lit
 * sur leur table d'en-tete (`assessments`, `attendance_registers`), et
 * l'enregistrement des notes touche `assessments.updated_at`. Idem pour
 * l'emploi du temps : la publication d'une version (`schedule_versions`), pas
 * les milliers de seances generees.
 *
 * Toute table ajoutee ici doit l'etre aussi a la publication `supabase_realtime`
 * (migration 0048) et avoir une colonne `school_id`.
 */
export const LIVE_TABLES = [
  // personnes
  'students',
  'student_enrollments',
  'student_guardians',
  'teachers',
  // acces
  'account_access',
  'credential_deliveries',
  // pedagogie
  'assessments',
  'report_cards',
  'attendance_registers',
  'absence_justifications',
  // communication
  'announcements',
  'notifications',
  // structure
  'academic_years',
  'academic_periods',
  'average_completions',
  'classes',
  'subjects',
  'rooms',
  'teaching_assignments',
  'schedule_versions',
] as const;
