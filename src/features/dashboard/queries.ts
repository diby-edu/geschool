import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { getSchoolSubscription } from '@/features/billing/platform';
import { unreadCount } from '@/features/communication/inbox';
import { activityLabel } from '@/lib/audit/labels';
import type { ActivityItem, TodoItem, StaffOverview, TeacherOverview, TeacherStats, FamilyOverview, DashboardData } from './types';

export type { Sparkline, ActivityItem, TodoItem, StaffOverview, TeacherOverview, TeacherStats, FamilyOverview, DashboardData } from './types';

/**
 * Donnees du tableau de bord, adaptees au role et TOUJOURS filtrees par la RLS.
 *
 * Chaque section est en plus gardee par la permission qui protege ses donnees
 * cote base (ARCHITECTURE.md §4) : un comptable (ACCOUNTANT) a `students.view`
 * mais ni `reports.view` ni `attendance.view_all` ni `classes.view` — il entre
 * donc dans la branche « staff », mais n'y voit que les cartes que ses
 * permissions ouvrent reellement. Rien n'est invente pour combler l'espace :
 * une section sans permission est simplement absente (`null`), jamais a zero
 * comme si la donnee existait et valait zero.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Utilitaires de date
// ---------------------------------------------------------------------------

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/** Bornes [debut, fin) des 6 dernieres semaines glissantes (7 jours chacune). */
function weekBuckets(count: number): { from: string; to: string; label: string }[] {
  const buckets: { from: string; to: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const to = new Date(Date.now() - i * 7 * DAY_MS);
    const from = new Date(to.getTime() - 7 * DAY_MS);
    buckets.push({ from: from.toISOString(), to: to.toISOString(), label: `S-${i}` });
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Section : presence
// ---------------------------------------------------------------------------

async function loadAttendance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
): Promise<StaffOverview['attendance']> {
  const buckets = weekBuckets(6);

  async function rateOf(from: string, to: string): Promise<number | null> {
    const [{ count: total }, { count: absent }] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .gte('recorded_at', from)
        .lt('recorded_at', to),
      supabase
        .from('attendance_records')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', 'ABSENT')
        .gte('recorded_at', from)
        .lt('recorded_at', to),
    ]);
    if (!total) return null;
    return Math.round((1 - (absent ?? 0) / total) * 1000) / 10;
  }

  const rates = await Promise.all(buckets.map((b) => rateOf(b.from, b.to)));
  const series = buckets.map((b, i) => ({ label: b.label, value: rates[i] ?? null }));
  const rate7d = rates[rates.length - 1];
  const ratePrev7d = rates[rates.length - 2];
  if (rate7d === null || rate7d === undefined) return null;

  return { rate7d, ratePrev7d: ratePrev7d ?? rate7d, series };
}

// ---------------------------------------------------------------------------
// Section : periode courante, moyennes, bulletins
// ---------------------------------------------------------------------------

type PeriodRow = { id: string; name: string; sequence: number; starts_on: string };

async function loadCurrentPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  yearId: string,
): Promise<{ current: PeriodRow | null; previous: PeriodRow | null }> {
  const { data } = await supabase
    .from('academic_periods')
    .select('id, name, sequence, starts_on')
    .eq('school_id', schoolId)
    .eq('academic_year_id', yearId)
    .eq('is_grading_period', true)
    .order('sequence');
  const periods = (data ?? []) as PeriodRow[];
  if (periods.length === 0) return { current: null, previous: null };

  const today = new Date().toISOString().slice(0, 10);
  const started = periods.filter((p) => p.starts_on <= today);
  const current = started[started.length - 1] ?? periods[0]!;
  const idx = periods.findIndex((p) => p.id === current.id);
  const previous = idx > 0 ? periods[idx - 1]! : null;
  return { current, previous };
}

async function averageOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  periodId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('report_cards')
    .select('general_average')
    .eq('school_id', schoolId)
    .eq('academic_period_id', periodId)
    .not('general_average', 'is', null);
  const values = ((data ?? []) as { general_average: number }[]).map((r) => Number(r.general_average));
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

async function bulletinsProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  periodId: string,
  totalClasses: number,
): Promise<{ published: number; total: number }> {
  const { data } = await supabase
    .from('report_cards')
    .select('class_id, status')
    .eq('school_id', schoolId)
    .eq('academic_period_id', periodId);
  const rows = (data ?? []) as { class_id: string; status: string }[];
  const byClass = new Map<string, { total: number; published: number }>();
  for (const r of rows) {
    const c = byClass.get(r.class_id) ?? { total: 0, published: 0 };
    c.total += 1;
    if (r.status === 'PUBLISHED') c.published += 1;
    byClass.set(r.class_id, c);
  }
  let published = 0;
  for (const c of byClass.values()) {
    if (c.total > 0 && c.published === c.total) published += 1;
  }
  return { published, total: totalClasses };
}

// ---------------------------------------------------------------------------
// Section : classes (remplissage, repartition par niveau)
// ---------------------------------------------------------------------------

type ClassRow = { id: string; name: string; capacity: number; level_id: string | null; levels: { name: string } | null };

async function loadClasses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  yearId: string,
): Promise<{ classes: ClassRow[]; enrolledByClass: Map<string, number> }> {
  const [{ data: classData }, { data: enrollData }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name, capacity, level_id, levels(name)')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('status', 'ACTIVE'),
    supabase
      .from('student_enrollments')
      .select('class_id')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('status', 'ENROLLED'),
  ]);

  const classes = ((classData ?? []) as unknown as ClassRow[]).sort((a, b) => a.name.localeCompare(b.name));
  const enrolledByClass = new Map<string, number>();
  for (const row of (enrollData ?? []) as { class_id: string }[]) {
    enrolledByClass.set(row.class_id, (enrolledByClass.get(row.class_id) ?? 0) + 1);
  }
  return { classes, enrolledByClass };
}

// ---------------------------------------------------------------------------
// Section : activite recente (journal d'audit)
// ---------------------------------------------------------------------------

async function loadActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('audit_logs')
    .select('id, action, module, actor_role, created_at')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(8);
  const rows = (data ?? []) as { id: string; action: string; module: string; actor_role: string | null; created_at: string }[];
  return rows.map((r) => {
    const known = activityLabel(r.action, r.module);
    return { id: r.id, label: known.label, detail: r.actor_role, at: r.created_at, tone: known.tone };
  });
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

async function loadStaffOverview(ctx: TenantContext): Promise<StaffOverview> {
  const supabase = await createClient();
  const schoolId = ctx.school.id;
  const yearId = ctx.academicYear?.id ?? null;

  const canClasses = hasPermission(ctx, 'classes.view');
  const canTeachers = hasPermission(ctx, 'teachers.view');
  const canAttendance = hasPermission(ctx, 'attendance.view_all');
  const canJustify = hasPermission(ctx, 'attendance.justify') || canAttendance;
  const canReports = hasPermission(ctx, 'reports.view');
  const canSchedule = hasPermission(ctx, 'schedule.view');
  const canBilling = hasPermission(ctx, 'billing.view');
  const canAudit = hasPermission(ctx, 'audit.view');

  const [
    studentsTotal,
    studentsNew30d,
    teachersCount,
    classesLoaded,
    attendance,
    period,
    pendingJustifications,
    scheduleVersion,
    subscription,
    activity,
  ] = await Promise.all([
    yearId
      ? supabase
          .from('student_enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .eq('academic_year_id', yearId)
          .eq('status', 'ENROLLED')
      : supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).is('deleted_at', null),
    yearId
      ? supabase
          .from('student_enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .eq('academic_year_id', yearId)
          .eq('status', 'ENROLLED')
          .gte('enrolled_on', isoDaysAgo(30).slice(0, 10))
      : Promise.resolve({ count: 0 }),
    canTeachers
      ? supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).is('deleted_at', null)
      : Promise.resolve({ count: null }),
    canClasses && yearId ? loadClasses(supabase, schoolId, yearId) : Promise.resolve(null),
    canAttendance ? loadAttendance(supabase, schoolId) : Promise.resolve(null),
    yearId ? loadCurrentPeriod(supabase, schoolId, yearId) : Promise.resolve({ current: null, previous: null }),
    canJustify
      ? supabase
          .from('absence_justifications')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .eq('status', 'PENDING')
      : Promise.resolve({ count: null }),
    canSchedule && yearId
      ? supabase
          .from('schedule_versions')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .eq('academic_year_id', yearId)
          .eq('status', 'PUBLISHED')
      : Promise.resolve({ count: null }),
    canBilling ? getSchoolSubscription(schoolId) : Promise.resolve(null),
    canAudit ? loadActivity(supabase, schoolId) : Promise.resolve(null),
  ]);

  let grades: StaffOverview['grades'] = null;
  let bulletins: StaffOverview['bulletins'] = null;
  if (canReports && period.current) {
    const [average, averagePrev] = await Promise.all([
      averageOf(supabase, schoolId, period.current.id),
      period.previous ? averageOf(supabase, schoolId, period.previous.id) : Promise.resolve(null),
    ]);
    grades = { average, averagePrev };
    if (classesLoaded) {
      bulletins = await bulletinsProgress(supabase, schoolId, period.current.id, classesLoaded.classes.length);
    }
  }

  let levelDistribution: StaffOverview['levelDistribution'] = null;
  let classFill: StaffOverview['classFill'] = null;
  if (classesLoaded) {
    const byLevel = new Map<string, number>();
    const fill: { name: string; enrolled: number; capacity: number }[] = [];
    for (const c of classesLoaded.classes) {
      const enrolled = classesLoaded.enrolledByClass.get(c.id) ?? 0;
      const levelName = c.levels?.name ?? '—';
      byLevel.set(levelName, (byLevel.get(levelName) ?? 0) + enrolled);
      fill.push({ name: c.name, enrolled, capacity: c.capacity });
    }
    levelDistribution = Array.from(byLevel.entries()).map(([label, value]) => ({ label, value }));
    const ratio = (c: { enrolled: number; capacity: number }) => (c.capacity > 0 ? c.enrolled / c.capacity : -1);
    classFill = fill.sort((a, b) => ratio(b) - ratio(a)).slice(0, 6);
  }

  const base = `/e/${ctx.school.slug}`;
  const todos: TodoItem[] = [];
  if (bulletins && bulletins.published < bulletins.total) {
    todos.push({
      id: 'bulletins',
      severity: 'critical',
      label: `${bulletins.total - bulletins.published} classe(s) sans bulletin publie`,
      detail: `${bulletins.published} / ${bulletins.total} classes publiees`,
      href: `${base}/bulletins`,
    });
  }
  if (typeof pendingJustifications.count === 'number' && pendingJustifications.count > 0) {
    todos.push({
      id: 'justifications',
      severity: 'warning',
      label: `${pendingJustifications.count} justificatif(s) en attente`,
      detail: 'A traiter par la vie scolaire',
      href: `${base}/attendance/justificatifs`,
    });
  }
  if (canSchedule && yearId && typeof scheduleVersion.count === 'number' && scheduleVersion.count === 0) {
    todos.push({
      id: 'schedule',
      severity: 'info',
      label: 'Aucun emploi du temps publie cette annee',
      detail: ctx.academicYear?.name ?? '',
      href: `${base}/schedule`,
    });
  }
  if (subscription?.status === 'PAST_DUE') {
    todos.push({
      id: 'billing',
      severity: 'critical',
      label: 'Abonnement impaye',
      detail: subscription.plans?.name ?? '',
      href: `${base}/facturation`,
    });
  }

  return {
    kind: 'staff',
    periodName: period.current?.name ?? null,
    students: { total: studentsTotal.count ?? 0, new30d: studentsNew30d.count ?? 0 },
    teachers: teachersCount.count,
    classes: classesLoaded ? classesLoaded.classes.length : null,
    attendance,
    grades,
    bulletins,
    levelDistribution,
    classFill,
    pendingJustifications: pendingJustifications.count,
    scheduleGenerated: canSchedule && yearId ? (scheduleVersion.count ?? 0) > 0 : null,
    subscription: subscription ? { status: subscription.status, planName: subscription.plans?.name ?? null } : null,
    activity,
    todos,
  };
}

async function loadTeacherOverview(ctx: TenantContext): Promise<TeacherOverview> {
  const supabase = await createClient();
  const schoolId = ctx.school.id;
  const yearId = ctx.academicYear?.id ?? null;

  const { data: teacherRow } = await supabase
    .from('teachers')
    .select('id')
    .eq('school_id', schoolId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (!teacherRow || !yearId) {
    const unread = await unreadCount(ctx);
    return {
      kind: 'teacher',
      classes: [],
      stats: {
        classesCount: 0,
        studentsCount: 0,
        weeklyMinutes: 0,
        evaluationsCount: 0,
        callsDoneYear: 0,
        callsExpectedYear: 0,
        callsDonePeriod: 0,
        callsExpectedPeriod: 0,
        periodName: null,
      },
      unreadNotifications: unread,
    };
  }

  const [{ data: assigned }, { data: headOf }, unread] = await Promise.all([
    supabase
      .from('teaching_assignments')
      .select('class_id, classes(id, name, levels(name))')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('teacher_id', teacherRow.id)
      .eq('status', 'ACTIVE')
      .not('class_id', 'is', null),
    supabase
      .from('classes')
      .select('id, name, levels(name)')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('status', 'ACTIVE')
      .eq('head_teacher_id', teacherRow.id),
    unreadCount(ctx),
  ]);

  type ClassRef = { id: string; name: string; levels: { name: string } | null };
  const byId = new Map<string, ClassRef>();
  for (const r of (assigned ?? []) as unknown as { class_id: string; classes: ClassRef | null }[]) {
    if (r.classes) byId.set(r.classes.id, r.classes);
  }
  for (const c of (headOf ?? []) as unknown as ClassRef[]) {
    byId.set(c.id, c);
  }

  const classIds = Array.from(byId.keys());
  const counts = new Map<string, number>();
  if (classIds.length > 0) {
    const { data: enrollData } = await supabase
      .from('student_enrollments')
      .select('class_id')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('status', 'ENROLLED')
      .in('class_id', classIds);
    for (const row of (enrollData ?? []) as { class_id: string }[]) {
      counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
    }
  }

  const classes = Array.from(byId.values())
    .map((c) => ({ id: c.id, name: c.name, level: c.levels?.name ?? null, students: counts.get(c.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const stats = await loadTeacherStats(ctx, teacherRow.id, yearId, classes.length, classes.reduce((sum, c) => sum + c.students, 0));

  return { kind: 'teacher', classes, stats, unreadNotifications: unread };
}

async function loadTeacherStats(
  ctx: TenantContext,
  teacherId: string,
  yearId: string,
  classesCount: number,
  studentsCount: number,
): Promise<TeacherStats> {
  const supabase = await createClient();
  const schoolId = ctx.school.id;
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: assignRows }, { count: evaluationsCount }, period, { data: version }] = await Promise.all([
    supabase
      .from('teaching_assignments')
      .select('weekly_minutes')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('teacher_id', teacherId)
      .eq('status', 'ACTIVE'),
    supabase
      .from('assessments')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('teacher_id', teacherId),
    loadCurrentPeriod(supabase, schoolId, yearId),
    supabase
      .from('schedule_versions')
      .select('id')
      .eq('school_id', schoolId)
      .eq('academic_year_id', yearId)
      .eq('status', 'PUBLISHED')
      .maybeSingle(),
  ]);

  const weeklyMinutes = ((assignRows ?? []) as { weekly_minutes: number }[]).reduce((sum, r) => sum + r.weekly_minutes, 0);

  let callsDoneYear = 0;
  let callsExpectedYear = 0;
  let callsDonePeriod = 0;
  let callsExpectedPeriod = 0;

  if (version) {
    const { data: sessionRows } = await supabase
      .from('schedule_session_teachers')
      .select('session_id, schedule_sessions!inner(id, schedule_version_id)')
      .eq('teacher_id', teacherId)
      .eq('schedule_sessions.schedule_version_id', version.id);
    const sessionIds = ((sessionRows ?? []) as unknown as { session_id: string }[]).map((r) => r.session_id);

    if (sessionIds.length > 0) {
      const { data: occRows } = await supabase
        .from('session_occurrences')
        .select('id, occurs_on')
        .in('schedule_session_id', sessionIds)
        .eq('status', 'SCHEDULED')
        .lte('occurs_on', today);
      const occurrences = (occRows ?? []) as { id: string; occurs_on: string }[];
      callsExpectedYear = occurrences.length;
      const periodStart = period.current?.starts_on ?? null;
      const periodOccurrences = periodStart ? occurrences.filter((o) => o.occurs_on >= periodStart) : occurrences;
      callsExpectedPeriod = periodOccurrences.length;

      const occIds = occurrences.map((o) => o.id);
      if (occIds.length > 0) {
        const { data: regRows } = await supabase
          .from('attendance_registers')
          .select('session_occurrence_id')
          .in('session_occurrence_id', occIds)
          .in('status', ['SUBMITTED', 'VALIDATED']);
        const done = new Set(((regRows ?? []) as { session_occurrence_id: string }[]).map((r) => r.session_occurrence_id));
        callsDoneYear = occurrences.filter((o) => done.has(o.id)).length;
        callsDonePeriod = periodOccurrences.filter((o) => done.has(o.id)).length;
      }
    }
  }

  return {
    classesCount,
    studentsCount,
    weeklyMinutes,
    evaluationsCount: evaluationsCount ?? 0,
    callsDoneYear,
    callsExpectedYear,
    callsDonePeriod,
    callsExpectedPeriod,
    periodName: period.current?.name ?? null,
  };
}

async function loadFamilyOverview(ctx: TenantContext): Promise<FamilyOverview> {
  const supabase = await createClient();
  const schoolId = ctx.school.id;
  const yearId = ctx.academicYear?.id ?? null;

  const [{ data: studentsData }, unread] = await Promise.all([
    supabase
      .from('students')
      .select('id, first_name, last_name, matricule')
      .eq('school_id', schoolId)
      .is('deleted_at', null)
      .order('last_name'),
    unreadCount(ctx),
  ]);

  const students = (studentsData ?? []) as { id: string; first_name: string; last_name: string; matricule: string }[];
  const studentIds = students.map((s) => s.id);

  const enrollmentByStudent = new Map<string, { className: string }>();
  const lastAverageByStudent = new Map<string, number>();
  const absencesByStudent = new Map<string, number>();

  if (studentIds.length > 0 && yearId) {
    const [{ data: enrollData }, { data: reportData }, { data: absenceData }] = await Promise.all([
      supabase
        .from('student_enrollments')
        .select('student_id, classes(name)')
        .eq('school_id', schoolId)
        .eq('academic_year_id', yearId)
        .eq('status', 'ENROLLED')
        .in('student_id', studentIds),
      supabase
        .from('report_cards')
        .select('student_id, general_average, academic_periods(sequence)')
        .eq('school_id', schoolId)
        .eq('status', 'PUBLISHED')
        .in('student_id', studentIds),
      supabase
        .from('attendance_records')
        .select('student_id')
        .eq('school_id', schoolId)
        .eq('status', 'ABSENT')
        .gte('recorded_at', isoDaysAgo(30))
        .in('student_id', studentIds),
    ]);

    for (const r of (enrollData ?? []) as unknown as { student_id: string; classes: { name: string } | null }[]) {
      if (r.classes) enrollmentByStudent.set(r.student_id, { className: r.classes.name });
    }

    const bestSequence = new Map<string, number>();
    for (const r of (reportData ?? []) as unknown as {
      student_id: string;
      general_average: number | null;
      academic_periods: { sequence: number } | null;
    }[]) {
      if (r.general_average === null || !r.academic_periods) continue;
      const seq = r.academic_periods.sequence;
      const known = bestSequence.get(r.student_id);
      if (known === undefined || seq > known) {
        bestSequence.set(r.student_id, seq);
        lastAverageByStudent.set(r.student_id, Number(r.general_average));
      }
    }

    for (const r of (absenceData ?? []) as { student_id: string }[]) {
      absencesByStudent.set(r.student_id, (absencesByStudent.get(r.student_id) ?? 0) + 1);
    }
  }

  return {
    kind: 'family',
    students: students.map((s) => ({
      id: s.id,
      name: `${s.last_name.toUpperCase()} ${s.first_name}`,
      matricule: s.matricule,
      className: enrollmentByStudent.get(s.id)?.className ?? null,
      lastAverage: lastAverageByStudent.get(s.id) ?? null,
      absences30d: absencesByStudent.get(s.id) ?? 0,
    })),
    unreadNotifications: unread,
  };
}

export async function getDashboardData(ctx: TenantContext): Promise<DashboardData> {
  if (hasPermission(ctx, 'students.view') || ctx.isPlatformAdmin) {
    return loadStaffOverview(ctx);
  }

  const roles = ctx.membership?.roles ?? [];
  if (roles.includes('TEACHER')) {
    return loadTeacherOverview(ctx);
  }

  return loadFamilyOverview(ctx);
}
