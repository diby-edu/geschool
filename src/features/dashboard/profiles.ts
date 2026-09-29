import type { PermissionCode } from '@/lib/permissions';
import type { RoleCode } from '@/lib/permissions/roles';

/**
 * Tableau de bord PAR FONCTION (espace Direction).
 *
 * Chaque fonction du personnel a son angle : le directeur suit la pédagogie, le
 * censeur l'assiduité, le surveillant général la vie scolaire, l'éducateur les
 * appels et justificatifs, l'inspecteur la qualité pédagogique, la secrétaire
 * les inscriptions, l'informaticien les comptes. Le fondateur garde le tableau
 * complet (StaffView) — comme le Super Admin et toute personne sans fonction
 * reconnue.
 *
 * Règles, appliquées ici et nulle part ailleurs :
 *   1. les DROITS décident, dans les deux sens : un indicateur dont le droit est
 *      décoché disparaît (jamais affiché à zéro) ; un droit coché fait apparaître
 *      son indicateur, QUELLE QUE SOIT la fonction — comme dans le menu ;
 *   2. la fonction fixe l'ORDRE : ses indicateurs principaux d'abord, puis ceux
 *      que d'autres droits cochés ouvrent ;
 *   3. une personne qui cumule plusieurs fonctions a plusieurs angles
 *      principaux ; chaque indicateur n'apparaît qu'une fois.
 *
 * Fonctions pures : testées sans base (profiles.test.ts).
 */

export type Focus = 'pedagogy' | 'attendance' | 'schoolLife' | 'followUp' | 'inspection' | 'enrollment' | 'accounts';

export type KpiKey =
  | 'callsToday'
  | 'missedCalls'
  | 'absentToday'
  | 'lateToday'
  | 'lowClasses'
  | 'pendingJustifications'
  | 'absentStudents30d'
  | 'toClose'
  | 'lateAssessments'
  | 'assessmentsPeriod'
  | 'teachersWithout'
  | 'schoolAverage'
  | 'classesBelow'
  | 'averagesDone'
  | 'bulletinsToValidate'
  | 'scheduleStatus'
  | 'programmeCoverage'
  | 'students'
  | 'newEnrollments'
  | 'parentsPending'
  | 'credentialsToSend'
  | 'failedDeliveries'
  | 'suspendedAccesses'
  | 'notActivated'
  | 'teachersNoAccess';

export type BlockKey =
  | 'day'
  | 'watch'
  | 'topAbsentees'
  | 'justifications'
  | 'grading'
  | 'classAverages'
  | 'assessmentActivity'
  | 'recentEnrollments'
  | 'accessQueue'
  | 'activity'
  | 'announcements';

/** Droits exigés : tous ceux de `all`, et au moins un de `any`. */
type Need = { all?: readonly PermissionCode[]; any?: readonly PermissionCode[] };

const ATTENDANCE: Need = { all: ['attendance.view_all'] };
// Les justificatifs se lisent par l'élève (RLS : can_see_student) : sans « Voir les
// élèves », le compte serait faux (0) — l'indicateur disparaît plutôt.
const JUSTIFY: Need = { all: ['students.view'], any: ['attendance.justify', 'attendance.view_all'] };

export const KPI_NEEDS: Record<KpiKey, Need> = {
  callsToday: ATTENDANCE,
  missedCalls: ATTENDANCE,
  absentToday: ATTENDANCE,
  lateToday: ATTENDANCE,
  lowClasses: ATTENDANCE,
  pendingJustifications: JUSTIFY,
  absentStudents30d: ATTENDANCE,
  toClose: { all: ['assessments.view'] },
  lateAssessments: { all: ['assessments.view'] },
  assessmentsPeriod: { all: ['assessments.view'] },
  teachersWithout: { all: ['assessments.view'] },
  schoolAverage: { all: ['grades.view_all'] },
  classesBelow: { all: ['grades.view_all'] },
  averagesDone: { all: ['grades.view_all'] },
  bulletinsToValidate: { all: ['reports.view'] },
  scheduleStatus: { all: ['schedule.view'] },
  programmeCoverage: { all: ['subjects.view'] },
  students: { all: ['students.view'] },
  newEnrollments: { all: ['students.view'] },
  parentsPending: { all: ['access_accounts.view'] },
  credentialsToSend: { all: ['access_accounts.view'] },
  failedDeliveries: { all: ['access_accounts.view'] },
  suspendedAccesses: { all: ['access_accounts.view'] },
  notActivated: { all: ['access_accounts.view'] },
  teachersNoAccess: { all: ['teachers.view'] },
};

export const BLOCK_NEEDS: Record<BlockKey, Need> = {
  day: ATTENDANCE,
  watch: ATTENDANCE,
  topAbsentees: ATTENDANCE,
  justifications: JUSTIFY,
  grading: { all: ['grades.view_all'] },
  classAverages: { all: ['grades.view_all'] },
  assessmentActivity: { all: ['assessments.view'] },
  recentEnrollments: { all: ['students.view'] },
  accessQueue: { all: ['access_accounts.view'] },
  activity: { all: ['audit.view'] },
  announcements: { all: ['announcements.view'] },
};

export const FOCUS_LAYOUT: Record<Focus, { label: string; kpis: readonly KpiKey[]; blocks: readonly BlockKey[] }> = {
  pedagogy: {
    label: 'Pédagogie',
    kpis: ['toClose', 'lateAssessments', 'schoolAverage', 'classesBelow', 'bulletinsToValidate', 'scheduleStatus'],
    blocks: ['grading', 'classAverages', 'assessmentActivity'],
  },
  attendance: {
    label: 'Assiduité',
    kpis: ['callsToday', 'missedCalls', 'absentToday', 'lateToday', 'lowClasses'],
    blocks: ['day', 'watch', 'topAbsentees'],
  },
  schoolLife: {
    label: 'Vie scolaire',
    kpis: ['absentToday', 'lateToday', 'pendingJustifications', 'absentStudents30d'],
    blocks: ['justifications', 'topAbsentees', 'day'],
  },
  followUp: {
    label: 'Suivi des élèves',
    kpis: ['callsToday', 'absentToday', 'lateToday', 'pendingJustifications', 'credentialsToSend'],
    blocks: ['day', 'justifications'],
  },
  inspection: {
    label: 'Qualité pédagogique',
    kpis: ['assessmentsPeriod', 'teachersWithout', 'schoolAverage', 'averagesDone', 'programmeCoverage'],
    blocks: ['assessmentActivity', 'classAverages', 'grading'],
  },
  enrollment: {
    label: 'Inscriptions',
    kpis: ['students', 'newEnrollments', 'parentsPending', 'credentialsToSend', 'pendingJustifications'],
    blocks: ['recentEnrollments', 'accessQueue', 'announcements'],
  },
  accounts: {
    label: 'Comptes',
    kpis: ['notActivated', 'parentsPending', 'failedDeliveries', 'suspendedAccesses', 'teachersNoAccess'],
    blocks: ['accessQueue', 'activity'],
  },
};

/** Angle de chaque fonction du personnel. Le fondateur n'en a pas : il garde le tableau complet. */
export const FUNCTION_FOCUS: Partial<Record<RoleCode, Focus>> = {
  DIRECTOR: 'pedagogy',
  DEPUTY_DIRECTOR: 'pedagogy',
  CENSOR: 'attendance',
  HEAD_SUPERVISOR: 'schoolLife',
  SUPERVISOR: 'followUp',
  EDUCATION_INSPECTOR: 'inspection',
  SECRETARY: 'enrollment',
  IT_ADMIN: 'accounts',
};

/** Ordre d'affichage quand une personne cumule plusieurs fonctions : de la direction vers le support. */
const FOCUS_ORDER: readonly Focus[] = ['pedagogy', 'inspection', 'attendance', 'schoolLife', 'followUp', 'enrollment', 'accounts'];

/** Le tableau complet (celui du fondateur) : fondateur, ou personne sans fonction qui ait un angle propre. */
export function usesFullDashboard(roles: readonly string[]): boolean {
  return roles.includes('SCHOOL_ADMIN') || focusesFor(roles).length === 0;
}

export function focusesFor(roles: readonly string[]): Focus[] {
  const wanted = new Set(roles.map((r) => FUNCTION_FOCUS[r as RoleCode]).filter((f): f is Focus => Boolean(f)));
  return FOCUS_ORDER.filter((f) => wanted.has(f));
}

function allowed(need: Need, has: (code: PermissionCode) => boolean): boolean {
  if (need.all && !need.all.every(has)) return false;
  if (need.any && !need.any.some(has)) return false;
  return true;
}

/** Un groupe : indicateurs et blocs d'un angle, principal (la fonction) ou ouvert par d'autres droits. */
export type PlanGroup = { focus: Focus; primary: boolean; kpis: KpiKey[]; blocks: BlockKey[] };

export type DashboardPlan = {
  /** Angles principaux : ceux des fonctions de la personne. */
  focuses: Focus[];
  /** Indicateurs et blocs par angle, les principaux d'abord ; groupes vides retirés. */
  groups: PlanGroup[];
  kpis: KpiKey[];
  blocks: BlockKey[];
};

/**
 * Plan du tableau : les angles des fonctions d'abord, puis tous les autres
 * angles — chacun ne garde que ce que les droits cochés ouvrent, sans doublon.
 */
export function planDashboard(focuses: readonly Focus[], has: (code: PermissionCode) => boolean): DashboardPlan {
  const primary = new Set(focuses);
  const order: Focus[] = [...FOCUS_ORDER.filter((f) => primary.has(f)), ...FOCUS_ORDER.filter((f) => !primary.has(f))];
  const kpis = new Set<KpiKey>();
  const blocks = new Set<BlockKey>();
  const groups: PlanGroup[] = [];
  for (const f of order) {
    const mine: KpiKey[] = [];
    for (const k of FOCUS_LAYOUT[f].kpis) {
      if (!kpis.has(k) && allowed(KPI_NEEDS[k], has)) {
        kpis.add(k);
        mine.push(k);
      }
    }
    const mineBlocks: BlockKey[] = [];
    for (const b of FOCUS_LAYOUT[f].blocks) {
      if (!blocks.has(b) && allowed(BLOCK_NEEDS[b], has)) {
        blocks.add(b);
        mineBlocks.push(b);
      }
    }
    if (mine.length > 0 || mineBlocks.length > 0) groups.push({ focus: f, primary: primary.has(f), kpis: mine, blocks: mineBlocks });
  }
  return { focuses: order.filter((f) => primary.has(f)), groups, kpis: [...kpis], blocks: [...blocks] };
}
