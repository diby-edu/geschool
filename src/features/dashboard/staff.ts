import 'server-only';
import { schoolTracks } from '@/features/structure/queries';
import { periodsForTrack, mainTrack } from '@/features/academic-years/periods-by-track';

import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { EMPLOYMENT_OPTIONS } from '@/lib/hr';
import { getSchoolSubscription } from '@/features/billing/platform';
import { listStaff } from '@/features/staff/queries';
import { isoDaysAgo, loadActivity, loadClasses, loadParents } from './queries';
import type { DashParams, TopRange, WatchRange } from './params';
import { addDays, currentPeriod, mondayOf, periodShortLabel, resolveRange, schoolToday, type PeriodInfo, type RangeKey, type YearInfo } from './time';
import type {
  ClassPresence,
  DayOverview,
  DaySession,
  DayStudent,
  GradingOverview,
  GradingPendingRow,
  LowClass,
  NoCallClass,
  StaffOverview,
  TeacherCallDetail,
  TodoItem,
  TopMissed,
} from './types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PanelData =
  | { kind: 'calls'; sessions: DaySession[] }
  | { kind: 'pres'; classes: ClassPresence[] }
  | { kind: 'abs' | 'ret'; students: DayStudent[]; total: number }
  | { kind: 'noc'; classes: NoCallClass[] }
  | { kind: 'teacher'; detail: TeacherCallDetail | null; range: RangeKey; available: Record<RangeKey, boolean>; periodLabels: Record<'t1' | 't2' | 't3', string> };

export type StaffDashboard = {
  today: string;
  /** Periode de notation en cours (bandeau d'accueil). */
  periodName: string | null;
  /** Instant de la lecture : le total des appels « attendus » est celui de cet instant. */
  nowIso: string;
  overview: StaffOverview;
  /** Suivi du jour : null = droit absent ; `missing` = migration 0055 pas encore appliquee. */
  day: { overview: DayOverview | null; missing: boolean } | null;
  top: { rows: TopMissed[]; range: TopRange } | null;
  /** Moyennes et bulletins : null = droit absent ou aucune annee active. */
  grading: { data: GradingOverview | null; missing: boolean } | null;
  pendingAll: GradingPendingRow[] | null;
  watch: { rows: LowClass[]; range: WatchRange; available: Record<WatchRange, boolean> } | null;
  panel: PanelData | null;
  todos: TodoItem[];
};

const SIX_WEEKS = 6;

// ---------------------------------------------------------------------------
// Periodes de l'annee active
// ---------------------------------------------------------------------------

export async function loadPeriods(supabase: Supabase, ctx: TenantContext): Promise<{ periods: PeriodInfo[]; year: YearInfo | null }> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return { periods: [], year: null };
  const [{ data: periods }, { data: year }, tracks] = await Promise.all([
    supabase
      .from('academic_periods')
      .select('id, name, sequence, kind, starts_on, ends_on, tracks')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('is_grading_period', true)
      .order('sequence'),
    supabase.from('academic_years').select('starts_on, ends_on').eq('id', yearId).maybeSingle(),
    schoolTracks(ctx),
  ]);
  // Une école qui fait général ET technique porte DEUX découpages dans la même
  // année (trimestres et semestres). Le tableau de bord en suit un seul, sinon
  // « T1 », « T2 »… mélangeraient les deux : celui du général s'il existe, sinon
  // celui du technique ou du professionnel.
  const rows = periodsForTrack((periods ?? []) as (PeriodInfo & { tracks: string[] | null })[], mainTrack(tracks));
  return {
    periods: rows as PeriodInfo[],
    year: year ? { starts_on: year.starts_on as string, ends_on: year.ends_on as string } : null,
  };
}

// ---------------------------------------------------------------------------
// Statistiques actuelles (bloc 3) et donnees d'appoint
// ---------------------------------------------------------------------------

async function loadOverview(
  ctx: TenantContext,
  supabase: Supabase,
  today: string,
  nowIso: string,
): Promise<StaffOverview> {
  const schoolId = ctx.school.id;
  const yearId = ctx.academicYear?.id ?? null;
  const canClasses = hasPermission(ctx, 'classes.view');
  const canTeachers = hasPermission(ctx, 'teachers.view');
  const canAttendance = hasPermission(ctx, 'attendance.view_all');
  const canJustify = hasPermission(ctx, 'attendance.justify') || canAttendance;
  const canSchedule = hasPermission(ctx, 'schedule.view');
  const canStudents = hasPermission(ctx, 'students.view');

  const studentsCount = (extra?: (q: ReturnType<typeof enrolledQuery>) => ReturnType<typeof enrolledQuery>) => {
    const q = enrolledQuery();
    return extra ? extra(q) : q;
  };
  function enrolledQuery() {
    return supabase
      .from('student_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId ?? '')
      .eq('status', 'ENROLLED');
  }

  const weekFrom = addDays(mondayOf(today), -7 * (SIX_WEEKS - 1));

  const [studentsTotal, studentsNew, teacherRows, classesLoaded, parents, staff, weeklyRes, pendingJust, scheduleVersion, subscription, activity] =
    await Promise.all([
      canStudents
        ? yearId
          ? studentsCount()
          : supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).is('deleted_at', null)
        : Promise.resolve(null),
      canStudents && yearId ? studentsCount((q) => q.gte('enrolled_on', isoDaysAgo(30).slice(0, 10))) : Promise.resolve(null),
      canTeachers
        ? supabase.from('teachers').select('employment_type, user_id').eq('school_id', schoolId).is('deleted_at', null).limit(5000)
        : Promise.resolve(null),
      canClasses && yearId ? loadClasses(supabase, schoolId, yearId) : Promise.resolve(null),
      hasPermission(ctx, 'access_accounts.view') ? loadParents(supabase, schoolId) : Promise.resolve(null),
      hasPermission(ctx, 'users.view') ? listStaff(ctx) : Promise.resolve(null),
      canAttendance
        ? callRpc<{ week_start: string; records: number; ok: number }[]>(supabase, 'dashboard_weekly_attendance', {
            p_school: schoolId,
            p_from: weekFrom,
            p_to: today,
            p_now: nowIso,
          })
        : Promise.resolve(null),
      canJustify
        ? supabase.from('absence_justifications').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'PENDING')
        : Promise.resolve(null),
      canSchedule && yearId
        ? supabase
            .from('schedule_versions')
            .select('id', { count: 'exact', head: true })
            .eq('school_id', schoolId)
            .eq('academic_year_id', yearId)
            .eq('status', 'PUBLISHED')
        : Promise.resolve(null),
      hasPermission(ctx, 'billing.view') ? getSchoolSubscription(schoolId) : Promise.resolve(null),
      hasPermission(ctx, 'audit.view') ? loadActivity(supabase, schoolId) : Promise.resolve(null),
    ]);

  // Places, niveaux
  let capacity: StaffOverview['capacity'] = null;
  let levelDistribution: StaffOverview['levelDistribution'] = null;
  if (classesLoaded) {
    const sized = classesLoaded.classes.filter((c) => c.capacity > 0);
    if (sized.length > 0) {
      capacity = {
        enrolled: sized.reduce((n, c) => n + (classesLoaded.enrolledByClass.get(c.id) ?? 0), 0),
        capacity: sized.reduce((n, c) => n + c.capacity, 0),
      };
    }
    const byLevel = new Map<string, number>();
    for (const c of classesLoaded.classes) {
      const name = c.levels?.name ?? '—';
      byLevel.set(name, (byLevel.get(name) ?? 0) + (classesLoaded.enrolledByClass.get(c.id) ?? 0));
    }
    levelDistribution = Array.from(byLevel.entries()).map(([label, value]) => ({ label, value }));
  }

  // Enseignants : total, acces crees, types de contrat
  let teachers: StaffOverview['teachers'] = null;
  if (teacherRows?.data) {
    const rows = teacherRows.data as { employment_type: string; user_id: string | null }[];
    teachers = {
      total: rows.length,
      withAccess: rows.filter((r) => r.user_id).length,
      byContract: EMPLOYMENT_OPTIONS.map((o) => ({ code: o.code, label: o.label, count: rows.filter((r) => r.employment_type === o.code).length })).filter((c) => c.count > 0),
    };
  }

  // Personnel : personnes et fonctions distinctes
  let personnel: StaffOverview['personnel'] = null;
  if (staff) {
    const labels = new Map<string, string>();
    for (const row of staff) for (const f of row.functions) labels.set(f.code, f.label);
    personnel = { total: staff.length, functions: labels.size, labels: Array.from(labels.values()) };
  }

  // Assiduite hebdomadaire : une semaine sans appel = trou (null), jamais 0 %.
  let weekly: StaffOverview['weekly'] = null;
  if (weeklyRes?.data) {
    const byWeek = new Map(weeklyRes.data.map((w) => [String(w.week_start).slice(0, 10), w]));
    const series = Array.from({ length: SIX_WEEKS }, (_, i) => {
      const w = byWeek.get(addDays(mondayOf(today), -7 * (SIX_WEEKS - 1 - i)));
      return { label: `S${i + 1}`, value: w && w.records > 0 ? Math.round((w.ok / w.records) * 1000) / 10 : null };
    });
    const known = series.filter((s): s is { label: string; value: number } => s.value !== null);
    const last = known[known.length - 1];
    if (last) weekly = { rate7d: last.value, ratePrev7d: known[known.length - 2]?.value ?? last.value, series };
  }

  // Un comptage qui ECHOUE n'est pas un comptage a zero. PostgREST repond en
  // HEAD, donc sans corps : l'erreur arrive sans message, et `count` reste nul.
  // Afficher « 0 eleve » dans une ecole qui en compte huit cents est pire que
  // de ne rien afficher — on prefere taire la section.
  const compte = (r: { count: number | null; error: unknown } | null): number | null =>
    r && !r.error ? (r.count ?? 0) : null;
  const studentsCounted = compte(studentsTotal);

  return {
    kind: 'staff',
    students:
      studentsTotal && studentsCounted !== null
        ? { total: studentsCounted, new30d: compte(studentsNew) ?? 0 }
        : null,
    capacity,
    parents,
    teachers,
    personnel,
    classes: classesLoaded ? classesLoaded.classes.length : null,
    levelDistribution,
    weekly,
    pendingJustifications: compte(pendingJust),
    activity,
    scheduleGenerated: canSchedule && yearId ? (compte(scheduleVersion) ?? 0) > 0 : null,
    subscription: subscription ? { status: subscription.status, planName: subscription.plans?.name ?? null } : null,
  };
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

const WATCH_KEYS: WatchRange[] = ['w7', 'm', 't', 'y'];
const TEACHER_KEYS: RangeKey[] = ['d', 'w', 'm', 't1', 't2', 't3', 'y'];

/**
 * Parties à charger. Le tableau complet (fondateur) charge tout ; un tableau par
 * fonction (RoleView) ne demande que les blocs de son plan — un droit présent ne
 * suffit pas à faire calculer ce que la fonction n'affiche pas.
 */
export type StaffInclude = { overview: boolean; day: boolean; grading: boolean; watch: boolean };
const EVERYTHING: StaffInclude = { overview: true, day: true, grading: true, watch: true };

const NO_OVERVIEW: StaffOverview = {
  kind: 'staff',
  students: null,
  capacity: null,
  parents: null,
  teachers: null,
  personnel: null,
  classes: null,
  levelDistribution: null,
  weekly: null,
  pendingJustifications: null,
  activity: null,
  scheduleGenerated: null,
  subscription: null,
};

export async function loadStaffDashboard(ctx: TenantContext, params: DashParams, include: StaffInclude = EVERYTHING): Promise<StaffDashboard> {
  const supabase = await createClient();
  const schoolId = ctx.school.id;
  const yearId = ctx.academicYear?.id ?? null;
  const now = new Date();
  const nowIso = now.toISOString();
  const today = schoolToday(ctx.school.timezone, now);

  const canDay = hasPermission(ctx, 'attendance.view_all') && include.day;
  const canWatch = hasPermission(ctx, 'attendance.view_all') && include.watch;
  const canGrading = hasPermission(ctx, 'grades.view_all') && Boolean(yearId) && include.grading;

  const { periods, year } = await loadPeriods(supabase, ctx);
  const topRange = resolveRange(params.top, today, periods, year) ?? { from: today, to: today };
  const watchRange = resolveRange(params.watch, today, periods, year) ?? resolveRange('w7', today, periods, year)!;

  const [overview, dayRes, topRes, gradingRes, watchRes] = await Promise.all([
    include.overview ? loadOverview(ctx, supabase, today, nowIso) : Promise.resolve(NO_OVERVIEW),
    canDay ? callRpc<DayOverview>(supabase, 'dashboard_day_overview', { p_school: schoolId, p_day: today, p_now: nowIso }) : Promise.resolve(null),
    canDay
      ? callRpc<TopMissed[]>(supabase, 'dashboard_top_missed_calls', { p_school: schoolId, p_from: topRange.from, p_to: topRange.to, p_now: nowIso, p_limit: 5 })
      : Promise.resolve(null),
    canGrading
      ? callRpc<GradingOverview | null>(supabase, 'dashboard_grading_overview', { p_school: schoolId, p_year: yearId, p_today: today, p_pending_limit: 5 })
      : Promise.resolve(null),
    canWatch
      ? callRpc<LowClass[]>(supabase, 'dashboard_low_attendance_classes', { p_school: schoolId, p_from: watchRange.from, p_to: watchRange.to, p_now: nowIso, p_limit: 6 })
      : Promise.resolve(null),
  ]);

  // « Voir plus » : liste complete des enseignants sans moyennes terminees
  let pendingAll: GradingPendingRow[] | null = null;
  const gradingData = gradingRes?.data ?? null;
  if (params.more && gradingData?.period.open) {
    const r = await callRpc<GradingPendingRow[]>(supabase, 'dashboard_grading_pending', { p_school: schoolId, p_year: yearId, p_period: gradingData.period.id, p_limit: 200 });
    pendingAll = r.data;
  }

  // Panneau ouvert (detail d'un chiffre, d'un enseignant)
  let panel: PanelData | null = null;
  if (canDay && params.panel) {
    const base = { p_school: schoolId, p_day: today, p_now: nowIso };
    if (params.panel === 'calls') {
      panel = { kind: 'calls', sessions: (await callRpc<DaySession[]>(supabase, 'dashboard_day_sessions', base)).data ?? [] };
    } else if (params.panel === 'pres') {
      panel = { kind: 'pres', classes: (await callRpc<ClassPresence[]>(supabase, 'dashboard_day_presence_by_class', base)).data ?? [] };
    } else if (params.panel === 'abs' || params.panel === 'ret') {
      const rows = (await callRpc<DayStudent[]>(supabase, 'dashboard_day_students', { ...base, p_kind: params.panel === 'abs' ? 'absent' : 'late', p_limit: 40 })).data ?? [];
      panel = { kind: params.panel, students: rows, total: rows[0] ? Number(rows[0].total) : 0 };
    } else if (params.panel === 'noc') {
      panel = { kind: 'noc', classes: (await callRpc<NoCallClass[]>(supabase, 'dashboard_day_no_call', base)).data ?? [] };
    } else if (params.panel === 'teacher' && params.tid) {
      const available = Object.fromEntries(TEACHER_KEYS.map((k) => [k, resolveRange(k, today, periods, year) !== null])) as Record<RangeKey, boolean>;
      const range = resolveRange(params.tp, today, periods, year) ?? { from: today, to: today };
      const detail = (await callRpc<TeacherCallDetail | null>(supabase, 'dashboard_teacher_call_detail', { p_school: schoolId, p_teacher: params.tid, p_from: range.from, p_to: range.to, p_now: nowIso })).data;
      const label = (n: number) => (periods[n - 1] ? periodShortLabel(periods[n - 1]!) : `T${n}`);
      panel = { kind: 'teacher', detail, range: params.tp, available, periodLabels: { t1: label(1), t2: label(2), t3: label(3) } };
    }
  }

  const base = `/e/${ctx.school.slug}`;
  const todos: TodoItem[] = [];
  // Sans année active, rien ne fonctionne (élèves, classes, emploi du temps, notes) : c'est LE premier point.
  if (!ctx.academicYear) {
    todos.push({
      id: 'year',
      severity: 'critical',
      label: 'Aucune année scolaire active',
      detail: 'Créez et activez l’année en cours pour inscrire des élèves et créer les classes',
      href: `${base}/academic-years`,
      module: 'parametres',
    });
  }
  const day = dayRes?.data ?? null;
  if (overview.pendingJustifications && overview.pendingJustifications > 0) {
    todos.push({
      id: 'justifications',
      severity: 'warning',
      label: `${overview.pendingJustifications} justificatif(s) en attente`,
      detail: 'Absences à valider ou refuser',
      href: `${base}/attendance/justificatifs`,
      module: 'presences',
    });
  }
  if (day && day.missed > 0) {
    todos.push({
      id: 'appels',
      severity: 'critical',
      label: `${day.missed} appel(s) non fait(s) aujourd’hui`,
      detail: 'Créneau terminé sans appel',
      href: `${base}/dashboard?panel=calls&ptab=missed`,
      module: 'presences',
    });
  }
  if (gradingData?.period.open && gradingData.bulletins_to_validate > 0) {
    todos.push({
      id: 'bulletins',
      severity: 'warning',
      label: `${gradingData.bulletins_to_validate} classe(s) à valider`,
      detail: `Bulletins — ${gradingData.period.name}`,
      href: `${base}/bulletins`,
      module: 'bulletins',
    });
  }
  if (overview.parents && overview.parents.pending > 0) {
    todos.push({
      id: 'parents',
      severity: 'info',
      label: `${overview.parents.pending} compte(s) parent à activer`,
      detail: 'Envoyer les identifiants',
      href: `${base}/access?kind=GUARDIAN&status=NOT_ACTIVATED`,
      module: 'acces',
    });
  }
  if (overview.scheduleGenerated === false) {
    todos.push({ id: 'schedule', severity: 'info', label: 'Aucun emploi du temps publié cette année', detail: ctx.academicYear?.name ?? '', href: `${base}/schedule`, module: 'edt' });
  }
  if (overview.subscription?.status === 'PAST_DUE') {
    todos.push({ id: 'billing', severity: 'critical', label: 'Abonnement impayé', detail: overview.subscription.planName ?? '', href: `${base}/facturation` });
  }

  return {
    today,
    periodName: currentPeriod(periods, today)?.name ?? null,
    nowIso,
    overview,
    day: canDay ? { overview: day, missing: Boolean(dayRes?.missing) } : null,
    top: canDay && topRes ? { rows: topRes.data ?? [], range: params.top } : null,
    grading: canGrading ? { data: gradingData, missing: Boolean(gradingRes?.missing) } : null,
    pendingAll,
    watch:
      canWatch && watchRes
        ? {
            rows: watchRes.data ?? [],
            range: params.watch,
            available: Object.fromEntries(WATCH_KEYS.map((k) => [k, resolveRange(k, today, periods, year) !== null])) as Record<WatchRange, boolean>,
          }
        : null,
    panel,
    todos,
  };
}
