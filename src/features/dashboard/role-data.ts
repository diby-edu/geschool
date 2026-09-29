import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { personName } from '@/lib/person-name';
import type { ModuleKey } from '@/lib/modules';
import { listJustifications, type JustificationRow } from '@/features/attendance/justifications';
import { listAnnouncements } from '@/features/communication/announcements';
import { IMPORT_KIND_ORDER } from '@/features/import/kinds';
import { canImport } from '@/features/import/service';
import { EXPORT_PERMISSION } from '@/features/import/export';
import { isoDaysAgo, loadActivity, loadParents } from './queries';
import type { DashParams } from './params';
import type { BlockKey, DashboardPlan, KpiKey } from './profiles';
import { loadPeriods, loadStaffDashboard, type StaffDashboard } from './staff';
import { addDays, currentPeriod, schoolToday } from './time';
import type { ActivityItem, LowClass, TodoItem } from './types';

/**
 * Données d'un tableau de bord PAR FONCTION (voir profiles.ts). Seules les
 * requêtes du plan partent : un indicateur absent du plan — fonction qui ne
 * l'affiche pas, ou droit décoché — ne coûte rien. Tout passe par la RLS, ou par
 * une fonction SQL qui vérifie elle-même le droit (0055, 0056, 0060).
 */

export type ClassAverage = {
  class_id: string;
  class_name: string;
  level_name: string | null;
  enrolled: number;
  graded: number;
  average: number | null;
  below_10: number;
};

export type AssessmentActivity = {
  total: number;
  to_close: number;
  late: number;
  no_grades: number;
  closed: number;
  published: number;
  teachers_assigned: number;
  teachers_without: number;
  teachers: { teacher_id: string; name: string | null; total: number; to_close: number; late: number; last_date: string | null }[];
};

export type AbsentStudent = {
  student_id: string;
  last_name: string;
  first_name: string;
  class_name: string | null;
  absences: number;
  unjustified: number;
  lates: number;
  total: number;
};

export type RecentEnrollment = { student_id: string; name: string; class_name: string | null; enrolled_on: string | null };
export type QueuedDelivery = { id: string; name: string; recipient: string; status: string; attempts: number; error: string | null; at: string };
export type AnnouncementItem = { id: string; title: string; status: string; at: string | null };

export type KpiValue = {
  key: KpiKey;
  label: string;
  value: string;
  unit?: string | undefined;
  sub: string;
  module: ModuleKey;
  href?: string | undefined;
  /** Alerte : la tuile passe au rouge (appels non faits, retards de notes…). */
  alert?: boolean | undefined;
};

export type RoleDashboard = {
  today: string;
  nowIso: string;
  periodName: string | null;
  staff: StaffDashboard | null;
  kpis: KpiValue[];
  classAverages: ClassAverage[] | null;
  activity: AssessmentActivity | null;
  absentees: AbsentStudent[] | null;
  justifications: JustificationRow[] | null;
  enrollments: RecentEnrollment[] | null;
  deliveries: QueuedDelivery[] | null;
  feed: ActivityItem[] | null;
  announcements: AnnouncementItem[] | null;
  /** Une fonction SQL attendue n'existe pas encore (migration 0060 à appliquer). */
  missing: boolean;
  /** La page Importer / exporter s'ouvre (au moins une liste avec les droits de la personne). */
  importOpen: boolean;
  todos: TodoItem[];
};

const fr = (n: number) => n.toLocaleString('fr-FR');
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);
const avg1 = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function headCount(q: PromiseLike<{ count: number | null }>): Promise<number> {
  const { count } = await q;
  return count ?? 0;
}

export async function loadRoleDashboard(ctx: TenantContext, plan: DashboardPlan, params: DashParams): Promise<RoleDashboard> {
  const supabase = await createClient();
  const schoolId = ctx.school.id;
  const yearId = ctx.academicYear?.id ?? null;
  const now = new Date();
  const nowIso = now.toISOString();
  const today = schoolToday(ctx.school.timezone, now);
  const k = new Set<KpiKey>(plan.kpis);
  const b = new Set<BlockKey>(plan.blocks);
  const any = (...keys: (KpiKey | BlockKey)[]) => keys.some((x) => k.has(x as KpiKey) || b.has(x as BlockKey));

  const { periods } = yearId ? await loadPeriods(supabase, ctx) : { periods: [] };
  const period = currentPeriod(periods, today);

  const needDay = any('callsToday', 'missedCalls', 'absentToday', 'lateToday', 'day');
  const needGrading = any('averagesDone', 'grading');
  const needStaff = needDay || needGrading || b.has('watch');

  const [
    staff,
    lowClasses,
    classAverages,
    activity,
    absentees,
    pendingJust,
    justList,
    bulletins,
    schedule,
    programme,
    students,
    newStudents,
    enrollments,
    parents,
    deliveryCounts,
    deliveries,
    accessCounts,
    teachersNoAccess,
    feed,
    announcements,
  ] = await Promise.all([
    needStaff
      ? loadStaffDashboard(ctx, params, { overview: false, day: needDay, grading: needGrading, watch: b.has('watch') })
      : Promise.resolve(null),
    k.has('lowClasses')
      ? callRpc<LowClass[]>(supabase, 'dashboard_low_attendance_classes', { p_school: schoolId, p_from: addDays(today, -6), p_to: today, p_now: nowIso, p_limit: 500 })
      : Promise.resolve(null),
    any('schoolAverage', 'classesBelow', 'classAverages') && period
      ? callRpc<ClassAverage[]>(supabase, 'dashboard_class_averages', { p_school: schoolId, p_period: period.id })
      : Promise.resolve(null),
    any('toClose', 'lateAssessments', 'assessmentsPeriod', 'teachersWithout', 'assessmentActivity') && period
      ? callRpc<AssessmentActivity>(supabase, 'dashboard_assessment_activity', { p_school: schoolId, p_period: period.id, p_today: today, p_limit: 8 })
      : Promise.resolve(null),
    any('absentStudents30d', 'topAbsentees')
      ? callRpc<AbsentStudent[]>(supabase, 'dashboard_top_absent_students', { p_school: schoolId, p_from: addDays(today, -29), p_to: today, p_now: nowIso, p_limit: 8 })
      : Promise.resolve(null),
    k.has('pendingJustifications')
      ? headCount(supabase.from('absence_justifications').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'PENDING'))
      : Promise.resolve(null),
    b.has('justifications') ? listJustifications(ctx, 'PENDING') : Promise.resolve(null),
    k.has('bulletinsToValidate') && yearId
      ? supabase.from('report_cards').select('class_id').eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'GENERATED').limit(10000)
      : Promise.resolve(null),
    k.has('scheduleStatus') && yearId
      ? headCount(supabase.from('schedule_versions').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'PUBLISHED'))
      : Promise.resolve(null),
    k.has('programmeCoverage') ? loadProgrammeCoverage(supabase, schoolId) : Promise.resolve(null),
    k.has('students') && yearId
      ? headCount(supabase.from('student_enrollments').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('academic_year_id', yearId).eq('status', 'ENROLLED'))
      : Promise.resolve(null),
    k.has('newEnrollments') && yearId
      ? headCount(
          supabase
            .from('student_enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId)
            .eq('academic_year_id', yearId)
            .eq('status', 'ENROLLED')
            .gte('enrolled_on', isoDaysAgo(30).slice(0, 10)),
        )
      : Promise.resolve(null),
    b.has('recentEnrollments') && yearId ? loadRecentEnrollments(supabase, schoolId, yearId) : Promise.resolve(null),
    k.has('parentsPending') ? loadParents(supabase, schoolId) : Promise.resolve(null),
    any('credentialsToSend', 'failedDeliveries') ? loadDeliveryCounts(supabase, schoolId) : Promise.resolve(null),
    b.has('accessQueue') ? loadDeliveryQueue(supabase, schoolId) : Promise.resolve(null),
    any('suspendedAccesses', 'notActivated') ? loadAccessCounts(supabase, schoolId) : Promise.resolve(null),
    k.has('teachersNoAccess')
      ? headCount(
          supabase
            .from('teachers')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId)
            .is('deleted_at', null)
            .eq('status', 'ACTIVE')
            .is('user_id', null),
        )
      : Promise.resolve(null),
    b.has('activity') ? loadActivity(supabase, schoolId) : Promise.resolve(null),
    b.has('announcements') ? listAnnouncements(ctx) : Promise.resolve(null),
  ]);

  const base = `/e/${ctx.school.slug}`;
  const day = staff?.day?.overview ?? null;
  const grading = staff?.grading?.data ?? null;
  const averages = classAverages?.data ?? null;
  const act = activity?.data ?? null;
  const absent = absentees?.data ?? null;
  const bulletinClasses = bulletins?.data ? new Set((bulletins.data as { class_id: string }[]).map((r) => r.class_id)).size : null;
  const page = (code: string, href: string) => (hasPermission(ctx, code) ? href : undefined);
  const dash = `${base}/dashboard`;

  // --- Indicateurs, dans l'ordre du plan ------------------------------------
  const kpis: KpiValue[] = [];
  const push = (v: KpiValue | null) => {
    if (v) kpis.push(v);
  };
  for (const key of plan.kpis) {
    switch (key) {
      case 'callsToday':
        push(day && {
          key,
          label: 'Appels faits aujourd’hui',
          value: fr(day.done),
          unit: `/ ${fr(day.expected)}`,
          sub: day.expected > 0 ? `${Math.round((day.done / day.expected) * 100)} % des séances terminées` : 'Aucune séance terminée pour l’instant',
          module: 'presences',
          href: `${dash}?panel=calls`,
        });
        break;
      case 'missedCalls':
        push(day && {
          key,
          label: 'Appels non faits',
          value: fr(day.missed),
          sub: day.missed > 0 ? 'Créneaux terminés sans appel' : 'Aucun appel manquant',
          module: 'presences',
          href: `${dash}?panel=calls&ptab=missed`,
          alert: day.missed > 0,
        });
        break;
      case 'absentToday':
        push(day && {
          key,
          label: 'Absents aujourd’hui',
          value: fr(day.absent),
          sub: `dont ${fr(day.justified)} ${plural(day.justified, 'justifié', 'justifiés')}, sur ${fr(day.counted)} ${plural(day.counted, 'élève compté', 'élèves comptés')}`,
          module: 'bulletins',
          href: `${dash}?panel=abs`,
        });
        break;
      case 'lateToday':
        push(day && { key, label: 'Retards aujourd’hui', value: fr(day.late), sub: 'Élèves arrivés en retard', module: 'acces', href: `${dash}?panel=ret` });
        break;
      case 'lowClasses': {
        const rows = lowClasses?.data;
        if (!rows) break;
        const low = rows.filter((r) => r.rate < 90).length;
        push({ key, label: 'Classes à surveiller', value: fr(low), sub: 'Moins de 90 % de présence sur 7 jours', module: 'eleves', alert: low > 0 });
        break;
      }
      case 'pendingJustifications':
        if (pendingJust !== null)
          push({
            key,
            label: 'Justificatifs en attente',
            value: fr(pendingJust),
            sub: pendingJust > 0 ? 'Absences à valider ou refuser' : 'Tout est traité',
            module: 'presences',
            href: page('attendance.justify', `${base}/attendance/justificatifs`),
            alert: pendingJust > 0,
          });
        break;
      case 'absentStudents30d':
        if (absent)
          push({
            key,
            label: 'Élèves absents (30 jours)',
            value: fr(absent[0]?.total ?? 0),
            sub: 'Au moins une absence sur les 30 derniers jours',
            module: 'eleves',
            // Indicateur réservé à « toutes les présences », qui ouvre la page des absences.
            href: `${base}/attendance/absences`,
          });
        break;
      case 'toClose':
        if (act)
          push({
            key,
            label: 'Notes à arrêter',
            value: fr(act.to_close),
            sub: `Évaluations passées encore ouvertes · ${fr(act.no_grades)} sans aucune note`,
            module: 'notes',
            href: page('assessments.view', `${base}/evaluations`),
          });
        break;
      case 'lateAssessments':
        if (act)
          push({
            key,
            label: 'Notes en retard',
            value: fr(act.late),
            sub: 'Évaluations passées depuis plus de 14 jours, notes non arrêtées',
            module: 'notes',
            href: page('assessments.view', `${base}/evaluations`),
            alert: act.late > 0,
          });
        break;
      case 'assessmentsPeriod':
        if (act)
          push({
            key,
            label: 'Évaluations de la période',
            value: fr(act.total),
            sub: `${fr(act.closed + act.published)} ${plural(act.closed + act.published, 'arrêtée', 'arrêtées')} · ${fr(act.published)} ${plural(act.published, 'publiée', 'publiées')}`,
            module: 'notes',
            href: page('assessments.view', `${base}/evaluations`),
          });
        break;
      case 'teachersWithout':
        if (act)
          push({
            key,
            label: 'Enseignants sans évaluation',
            value: fr(act.teachers_without),
            unit: `/ ${fr(act.teachers_assigned)}`,
            sub: 'Aucune évaluation sur la période',
            module: 'enseignants',
            alert: act.teachers_without > 0,
          });
        break;
      case 'schoolAverage':
        if (averages) {
          const graded = averages.reduce((n, c) => n + c.graded, 0);
          const sum = averages.reduce((n, c) => n + (c.average === null ? 0 : Number(c.average) * c.graded), 0);
          push({
            key,
            label: 'Moyenne de l’établissement',
            value: graded > 0 ? avg1(sum / graded) : '—',
            unit: graded > 0 ? '/ 20' : undefined,
            sub: graded > 0 ? `${fr(graded)} ${plural(graded, 'élève noté', 'élèves notés')} · ${period?.name ?? ''}` : 'Aucune note arrêtée sur la période',
            module: 'notes',
            href: page('grades.view_all', `${base}/evaluations/moyennes`),
          });
        }
        break;
      case 'classesBelow':
        if (averages) {
          const below = averages.filter((c) => c.average !== null && Number(c.average) < 10).length;
          push({
            key,
            label: 'Classes sous 10 de moyenne',
            value: fr(below),
            unit: `/ ${fr(averages.filter((c) => c.average !== null).length)}`,
            sub: 'Classes dont la moyenne générale est inférieure à 10',
            module: 'eleves',
            alert: below > 0,
          });
        }
        break;
      case 'averagesDone':
        if (grading)
          push({
            key,
            label: 'Moyennes terminées',
            value: fr(grading.teachers_done),
            unit: `/ ${fr(grading.teachers_total)}`,
            sub: `Enseignants ayant arrêté leurs moyennes · ${grading.period.name}`,
            module: 'notes',
          });
        break;
      case 'bulletinsToValidate':
        if (bulletinClasses !== null)
          push({
            key,
            label: 'Bulletins à valider',
            value: fr(bulletinClasses),
            sub: plural(bulletinClasses, 'Classe dont les bulletins attendent la validation', 'Classes dont les bulletins attendent la validation'),
            module: 'bulletins',
            href: page('reports.view', `${base}/bulletins`),
            alert: bulletinClasses > 0,
          });
        break;
      case 'scheduleStatus':
        if (schedule !== null)
          push({
            key,
            label: 'Emploi du temps',
            value: schedule > 0 ? 'Publié' : 'Non publié',
            sub: ctx.academicYear ? `Année ${ctx.academicYear.name}` : 'Aucune année active',
            module: 'edt',
            href: page('schedule.view', `${base}/schedule`),
            alert: schedule === 0,
          });
        break;
      case 'programmeCoverage':
        if (programme)
          push({
            key,
            label: 'Programme renseigné',
            value: fr(programme.covered),
            unit: `/ ${fr(programme.levels)}`,
            sub: 'Niveaux dont les matières et coefficients sont saisis',
            module: 'edt',
            href: page('subjects.view', `${base}/programme`),
            alert: programme.covered < programme.levels,
          });
        break;
      case 'students':
        if (students !== null)
          push({ key, label: 'Élèves inscrits', value: fr(students), sub: ctx.academicYear ? `Année ${ctx.academicYear.name}` : '', module: 'eleves', href: page('students.view', `${base}/students`) });
        break;
      case 'newEnrollments':
        if (newStudents !== null)
          push({ key, label: 'Nouvelles inscriptions', value: fr(newStudents), sub: 'Ces 30 derniers jours', module: 'eleves', href: page('students.view', `${base}/students`) });
        break;
      case 'parentsPending':
        if (parents)
          push({
            key,
            label: 'Comptes parents à activer',
            value: fr(parents.pending),
            sub: `${fr(parents.activated)} ${plural(parents.activated, 'parent connecté', 'parents connectés')} sur ${fr(parents.total)}`,
            module: 'acces',
            href: `${base}/access?kind=GUARDIAN&status=NOT_ACTIVATED`,
          });
        break;
      case 'credentialsToSend':
        if (deliveryCounts)
          push({
            key,
            label: 'Identifiants à envoyer',
            value: fr(deliveryCounts.pending),
            sub: deliveryCounts.pending > 0 ? 'Accès créés, identifiants pas encore envoyés' : 'Aucun envoi en attente',
            module: 'acces',
            href: `${base}/access`,
          });
        break;
      case 'failedDeliveries':
        if (deliveryCounts)
          push({
            key,
            label: 'Envois en échec',
            value: fr(deliveryCounts.failed),
            sub: deliveryCounts.failed > 0 ? 'SMS non remis : numéro à vérifier, puis renvoyer' : 'Aucun échec',
            module: 'acces',
            href: `${base}/access`,
            alert: deliveryCounts.failed > 0,
          });
        break;
      case 'suspendedAccesses':
        if (accessCounts)
          push({ key, label: 'Accès suspendus', value: fr(accessCounts.suspended), sub: 'Comptes bloqués à la connexion', module: 'acces', href: `${base}/access?status=SUSPENDED` });
        break;
      case 'notActivated':
        if (accessCounts)
          push({
            key,
            label: 'Accès non activés',
            value: fr(accessCounts.notActivated),
            unit: `/ ${fr(accessCounts.total)}`,
            sub: 'Personnes jamais connectées (enseignants, parents, personnel)',
            module: 'acces',
            href: `${base}/access?status=NOT_ACTIVATED`,
          });
        break;
      case 'teachersNoAccess':
        if (teachersNoAccess !== null)
          push({
            key,
            label: 'Enseignants sans accès',
            value: fr(teachersNoAccess),
            sub: 'Fiches enseignant sans compte de connexion',
            module: 'enseignants',
            href: page('teachers.view', `${base}/teachers`),
            alert: teachersNoAccess > 0,
          });
        break;
    }
  }

  // --- À traiter ----------------------------------------------------------------
  const todos: TodoItem[] = [];
  if (!ctx.academicYear && hasPermission(ctx, 'academic_years.view')) {
    todos.push({ id: 'year', severity: 'critical', label: 'Aucune année scolaire active', detail: 'Rien ne fonctionne sans année active (classes, notes, appels)', href: `${base}/academic-years`, module: 'parametres' });
  }
  if (day && day.missed > 0 && any('callsToday', 'missedCalls')) {
    todos.push({ id: 'appels', severity: 'critical', label: `${day.missed} appel(s) non fait(s) aujourd’hui`, detail: 'Créneau terminé sans appel', href: `${dash}?panel=calls&ptab=missed`, module: 'presences' });
  }
  if (pendingJust && pendingJust > 0 && hasPermission(ctx, 'attendance.justify')) {
    todos.push({ id: 'justifications', severity: 'warning', label: `${pendingJust} justificatif(s) en attente`, detail: 'Absences à valider ou refuser', href: `${base}/attendance/justificatifs`, module: 'presences' });
  }
  if (act && act.late > 0 && k.has('lateAssessments')) {
    todos.push({ id: 'notes', severity: 'warning', label: `${act.late} évaluation(s) aux notes en retard`, detail: 'Passées depuis plus de 14 jours, notes non arrêtées', href: `${base}/evaluations`, module: 'notes' });
  }
  if (bulletinClasses && bulletinClasses > 0 && hasPermission(ctx, 'reports.validate')) {
    todos.push({ id: 'bulletins', severity: 'warning', label: `${bulletinClasses} classe(s) : bulletins à valider`, detail: period?.name ?? '', href: `${base}/bulletins`, module: 'bulletins' });
  }
  if (deliveryCounts && deliveryCounts.failed > 0 && hasPermission(ctx, 'access_accounts.resend')) {
    todos.push({ id: 'envois', severity: 'warning', label: `${deliveryCounts.failed} envoi(s) d’identifiants en échec`, detail: 'Vérifier le numéro, puis renvoyer', href: `${base}/access`, module: 'acces' });
  }
  if (parents && parents.pending > 0 && hasPermission(ctx, 'access_accounts.send')) {
    todos.push({ id: 'parents', severity: 'info', label: `${parents.pending} compte(s) parent à activer`, detail: 'Envoyer les identifiants', href: `${base}/access?kind=GUARDIAN&status=NOT_ACTIVATED`, module: 'acces' });
  }
  if (schedule === 0) {
    todos.push({ id: 'schedule', severity: 'info', label: 'Aucun emploi du temps publié cette année', detail: ctx.academicYear?.name ?? '', href: `${base}/schedule`, module: 'edt' });
  }
  if (ctx.academicYear && !period && any('toClose', 'lateAssessments', 'assessmentsPeriod', 'teachersWithout', 'schoolAverage', 'classesBelow', 'assessmentActivity', 'classAverages')) {
    todos.push({
      id: 'periods',
      severity: 'warning',
      label: 'Aucun trimestre défini pour l’année',
      detail: 'Les indicateurs de notes apparaissent dès que les périodes de notation existent',
      href: hasPermission(ctx, 'academic_years.view') ? `${base}/academic-years/${ctx.academicYear.id}` : `${base}/evaluations`,
      module: 'notes',
    });
  }
  if (programme && programme.covered < programme.levels) {
    todos.push({ id: 'programme', severity: 'info', label: `${programme.levels - programme.covered} niveau(x) sans programme`, detail: 'Matières et coefficients à saisir', href: `${base}/programme`, module: 'edt' });
  }

  const missing = [lowClasses, classAverages, activity, absentees].some((r) => r?.missing);

  return {
    today,
    nowIso,
    periodName: period?.name ?? null,
    staff,
    kpis,
    classAverages: b.has('classAverages') ? averages : null,
    activity: b.has('assessmentActivity') ? act : null,
    absentees: b.has('topAbsentees') ? absent : null,
    justifications: justList ? justList.slice(0, 6) : null,
    enrollments,
    deliveries,
    feed,
    announcements: announcements
      ? announcements.slice(0, 4).map((a) => ({ id: a.id, title: a.title, status: a.status, at: a.published_at }))
      : null,
    missing,
    importOpen: IMPORT_KIND_ORDER.some((kind) => canImport(ctx, kind) || hasPermission(ctx, EXPORT_PERMISSION[kind])),
    todos,
  };
}

async function loadProgrammeCoverage(supabase: Supabase, schoolId: string): Promise<{ covered: number; levels: number }> {
  const [{ data: levels }, { data: rows }] = await Promise.all([
    supabase.from('levels').select('id').eq('school_id', schoolId).eq('is_active', true),
    supabase.from('level_subjects').select('level_id').eq('school_id', schoolId).limit(10000),
  ]);
  const active = new Set((levels ?? []).map((l) => l.id));
  const covered = new Set((rows ?? []).map((r) => r.level_id).filter((id) => active.has(id)));
  return { covered: covered.size, levels: active.size };
}

async function loadRecentEnrollments(supabase: Supabase, schoolId: string, yearId: string): Promise<RecentEnrollment[]> {
  const { data } = await supabase
    .from('student_enrollments')
    .select('student_id, enrolled_on, created_at, students(first_name, last_name), classes(name)')
    .eq('school_id', schoolId)
    .eq('academic_year_id', yearId)
    .eq('status', 'ENROLLED')
    .order('created_at', { ascending: false })
    .limit(6);
  return ((data ?? []) as unknown as {
    student_id: string;
    enrolled_on: string | null;
    created_at: string;
    students: { first_name: string; last_name: string } | null;
    classes: { name: string } | null;
  }[]).map((r) => ({
    student_id: r.student_id,
    name: r.students ? `${r.students.last_name.toUpperCase()} ${r.students.first_name}` : '—',
    class_name: r.classes?.name ?? null,
    enrolled_on: r.enrolled_on ?? r.created_at.slice(0, 10),
  }));
}

async function loadDeliveryCounts(supabase: Supabase, schoolId: string): Promise<{ pending: number; failed: number }> {
  const q = () => supabase.from('credential_deliveries').select('id', { count: 'exact', head: true }).eq('school_id', schoolId);
  const [pending, failed] = await Promise.all([headCount(q().eq('status', 'PENDING')), headCount(q().eq('status', 'FAILED'))]);
  return { pending, failed };
}

async function loadDeliveryQueue(supabase: Supabase, schoolId: string): Promise<QueuedDelivery[]> {
  const { data } = await supabase
    .from('credential_deliveries')
    .select('id, recipient, status, attempts, error_message, created_at, users!credential_deliveries_user_id_fkey(display_name, first_name, last_name)')
    .eq('school_id', schoolId)
    .in('status', ['PENDING', 'FAILED'])
    .order('created_at', { ascending: false })
    .limit(6);
  return ((data ?? []) as unknown as {
    id: string;
    recipient: string;
    status: string;
    attempts: number;
    error_message: string | null;
    created_at: string;
    users: { display_name: string | null; first_name: string; last_name: string } | null;
  }[]).map((d) => ({ id: d.id, name: personName(d.users), recipient: d.recipient, status: d.status, attempts: d.attempts, error: d.error_message, at: d.created_at }));
}

async function loadAccessCounts(supabase: Supabase, schoolId: string): Promise<{ total: number; suspended: number; notActivated: number }> {
  const q = () => supabase.from('account_access').select('id', { count: 'exact', head: true }).eq('school_id', schoolId);
  const [total, suspended, notActivated] = await Promise.all([
    headCount(q()),
    headCount(q().eq('account_status', 'SUSPENDED')),
    // Même définition que le filtre « Non activés » de la page Accès.
    headCount(q().neq('activation_status', 'ACTIVATED').neq('account_status', 'SUSPENDED')),
  ]);
  return { total, suspended, notActivated };
}
