import type { ModuleKey } from '@/lib/modules';

/** Types d'affichage du tableau de bord (sans acces base : utilisables en composant). */

// `value: null` signifie qu'aucun appel n'a ete enregistre cette semaine-la —
// une absence de donnee, jamais confondue avec un taux de presence de 0%.
export type Sparkline = { label: string; value: number | null }[];

export type ActivityItem = {
  id: string;
  label: string;
  detail: string | null;
  at: string;
  tone: 'brand' | 'good' | 'warn' | 'info';
};

export type TodoItem = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  label: string;
  detail: string;
  href: string;
  /** Module d'origine : donne sa pastille (même couleur que dans le menu). */
  module?: ModuleKey;
};

/** Statistiques actuelles de l'etablissement (bloc 3) et donnees d'appoint (analyses, a traiter). */
export type StaffOverview = {
  kind: 'staff';
  students: { total: number; new30d: number } | null;
  /** Places occupees / places prevues, sur les classes qui ont une capacite. */
  capacity: { enrolled: number; capacity: number } | null;
  /** Espace Parent : comptes crees, deja connectes, et ceux qui restent a activer (hors suspendus). */
  parents: { activated: number; total: number; pending: number } | null;
  teachers: { total: number; withAccess: number; byContract: { code: string; label: string; count: number }[] } | null;
  personnel: { total: number; functions: number; labels: string[] } | null;
  classes: number | null;
  levelDistribution: { label: string; value: number }[] | null;
  /** Assiduite des 6 dernieres semaines (une semaine sans appel = trou, jamais 0 %). */
  weekly: { rate7d: number; ratePrev7d: number; series: Sparkline } | null;
  pendingJustifications: number | null;
  activity: ActivityItem[] | null;
  scheduleGenerated: boolean | null;
  subscription: { status: string; planName: string | null } | null;
};

// ---------------------------------------------------------------------------
// Suivi du jour (fonctions SQL de la migration 0055)
// ---------------------------------------------------------------------------

export type DayOverview = {
  total: number;
  expected: number;
  done: number;
  missed: number;
  ongoing: number;
  upcoming: number;
  counted: number;
  present: number;
  late: number;
  absent: number;
  justified: number;
  nocall_students: number;
  nocall_classes: number;
};

export type DaySession = {
  occurrence_id: string;
  starts_at: string;
  ends_at: string;
  phase: 'done' | 'missed' | 'ongoing' | 'upcoming';
  called: boolean;
  taken_at: string | null;
  class_name: string | null;
  subject_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
};

export type ClassPresence = { class_id: string; class_name: string; counted: number; present: number; late: number; absent: number };

export type DayStudent = {
  student_id: string;
  last_name: string;
  first_name: string;
  class_name: string;
  justified: boolean;
  minutes_late: number;
  total: number;
};

export type NoCallClass = {
  class_id: string;
  class_name: string;
  uncounted: number;
  sessions: { starts_at: string; ends_at: string; subject: string | null; teacher_id: string | null; teacher: string | null }[];
};

export type TopMissed = { teacher_id: string; teacher_name: string | null; subjects: string | null; missed: number; expected: number };

export type TeacherCallDetail = {
  teacher_id: string;
  name: string | null;
  phone: string | null;
  employment_type: string;
  specialty: string | null;
  missed: number;
  expected: number;
  rows: { day: string; starts_at: string; ends_at: string; class: string | null; subject: string | null }[];
};

export type LowClass = { class_id: string; class_name: string; rate: number; unjustified: number; records: number };

// ---------------------------------------------------------------------------
// Moyennes et bulletins (migration 0056)
// ---------------------------------------------------------------------------

export type GradingOverview = {
  period: {
    id: string;
    name: string;
    starts_on: string;
    ends_on: string;
    grading_starts_on: string | null;
    grading_ends_on: string | null;
    override: 'OPEN' | 'CLOSED' | null;
    open: boolean;
  };
  teachers_total: number;
  teachers_done: number;
  assignments_total: number;
  assignments_done: number;
  pending_total: number;
  pending: { teacher_id: string; name: string | null; subjects: string | null; remaining: number }[];
  classes_total: number;
  bulletins_edited: number;
  bulletins_to_validate: number;
  bulletins_validated: number;
  bulletins_published: number;
};

export type GradingPendingRow = { teacher_id: string; teacher_name: string | null; subjects: string | null; remaining: number };

export type TeacherStats = {
  classesCount: number;
  studentsCount: number;
  weeklyMinutes: number;
  evaluationsCount: number;
  /** Depuis le debut de l'annee scolaire. */
  callsDoneYear: number;
  callsExpectedYear: number;
  /** Periode courante (trimestre/semestre) uniquement. */
  callsDonePeriod: number;
  callsExpectedPeriod: number;
  periodName: string | null;
};

/** Séance du jour de l'enseignant, avec son état à l'instant de la lecture. */
export type TeacherDayItem = {
  occurrenceId: string;
  klass: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  phase: 'done' | 'missed' | 'ongoing' | 'upcoming';
  called: boolean;
};

export type TeacherOverview = {
  kind: 'teacher';
  classes: { id: string; name: string; level: string | null; students: number }[];
  stats: TeacherStats;
  unreadNotifications: number;
  /** Séances du jour (null = droit « emploi du temps » absent). */
  day: TeacherDayItem[] | null;
  /** Ses évaluations passées dont les notes ne sont pas arrêtées (null = droit absent). */
  toClose: number | null;
};

export type FamilyGrade = { subject: string; title: string; score: number; max: number; date: string | null };

export type FamilyOverview = {
  kind: 'family';
  students: {
    id: string;
    name: string;
    matricule: string;
    className: string | null;
    lastAverage: number | null;
    absences30d: number;
    lates30d: number;
    /** Dernières notes publiées (les plus récentes d'abord). */
    lastGrades: FamilyGrade[];
    /** Bulletins publiés de l'année. */
    bulletins: number;
  }[];
  unreadNotifications: number;
  /** Annonces publiées destinées aux parents (ou à tout l'établissement). */
  announcements: { id: string; title: string; excerpt: string; publishedAt: string | null }[];
};

/** Tableaux de bord des espaces Enseignant et Parent (celui de la direction : voir staff.ts). */
export type DashboardData = TeacherOverview | FamilyOverview;
