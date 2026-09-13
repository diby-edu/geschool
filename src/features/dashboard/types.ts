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
};

export type StaffOverview = {
  kind: 'staff';
  periodName: string | null;
  students: { total: number; new30d: number } | null;
  teachers: number | null;
  classes: number | null;
  attendance: { rate7d: number; ratePrev7d: number; series: Sparkline } | null;
  grades: { average: number | null; averagePrev: number | null } | null;
  bulletins: { published: number; total: number } | null;
  levelDistribution: { label: string; value: number }[] | null;
  classFill: { name: string; enrolled: number; capacity: number }[] | null;
  pendingJustifications: number | null;
  scheduleGenerated: boolean | null;
  subscription: { status: string; planName: string | null } | null;
  activity: ActivityItem[] | null;
  todos: TodoItem[];
};

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

export type TeacherOverview = {
  kind: 'teacher';
  classes: { id: string; name: string; level: string | null; students: number }[];
  stats: TeacherStats;
  unreadNotifications: number;
};

export type FamilyOverview = {
  kind: 'family';
  students: {
    id: string;
    name: string;
    matricule: string;
    className: string | null;
    lastAverage: number | null;
    absences30d: number;
  }[];
  unreadNotifications: number;
};

export type DashboardData = StaffOverview | TeacherOverview | FamilyOverview;
