import 'server-only';
import { periodsForTrack, mainTrack } from '@/features/academic-years/periods-by-track';
import type { EducationTrack } from '@/features/structure/official-tracks';
import { schoolTracks } from '@/features/structure/queries';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import type { Space } from '@/lib/permissions/roles';
import { myChildrenIds } from '@/features/family/children';
import { unreadCount } from '@/features/communication/inbox';
import { activityLabel } from '@/lib/audit/labels';
import { hasPermission } from '@/lib/permissions';
import { listMySessionsOn } from '@/features/attendance/current';
import { sessionPhase } from '@/features/attendance/day-phase';
import { schoolToday } from './time';
import type { ActivityItem, FamilyGrade, TeacherDayItem, TeacherOverview, TeacherStats, FamilyOverview, DashboardData } from './types';

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

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

// ---------------------------------------------------------------------------
// Section : periode courante, moyennes, bulletins
// ---------------------------------------------------------------------------

type PeriodRow = { id: string; name: string; sequence: number; starts_on: string };

async function loadCurrentPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  yearId: string,
  track: EducationTrack = 'GENERAL',
): Promise<{ current: PeriodRow | null; previous: PeriodRow | null }> {
  const { data } = await supabase
    .from('academic_periods')
    .select('id, name, sequence, starts_on, tracks')
    .eq('school_id', schoolId)
    .eq('academic_year_id', yearId)
    .eq('is_grading_period', true)
    .order('sequence');
  // Une école à deux découpages (trimestres du général, semestres du technique)
  // en porte deux dans la même année : on n'en suit qu'un, sinon « la période en
  // cours » n'aurait pas de sens.
  const periods = periodsForTrack((data ?? []) as (PeriodRow & { tracks: string[] | null })[], track);
  if (periods.length === 0) return { current: null, previous: null };

  const today = new Date().toISOString().slice(0, 10);
  const started = periods.filter((p) => p.starts_on <= today);
  const current = started[started.length - 1] ?? periods[0]!;
  const idx = periods.findIndex((p) => p.id === current.id);
  const previous = idx > 0 ? periods[idx - 1]! : null;
  return { current, previous };
}

// ---------------------------------------------------------------------------
// Section : classes (remplissage, repartition par niveau)
// ---------------------------------------------------------------------------

export type ClassRow = { id: string; name: string; capacity: number; level_id: string | null; levels: { name: string } | null };

export async function loadClasses(
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

export async function loadActivity(
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

/** Comptes de parents : créés / déjà connectés au moins une fois (activés). */
export async function loadParents(supabase: Awaited<ReturnType<typeof createClient>>, schoolId: string) {
  const guardians = () =>
    supabase
      .from('account_access')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('subject_kind', 'GUARDIAN');
  const [total, activated, pending] = await Promise.all([
    guardians(),
    guardians().eq('activation_status', 'ACTIVATED'),
    // Même définition que le filtre « Non activés » de la page Accès : un compte suspendu n'est pas « à activer ».
    guardians().neq('activation_status', 'ACTIVATED').neq('account_status', 'SUSPENDED'),
  ]);
  return { total: total.count ?? 0, activated: activated.count ?? 0, pending: pending.count ?? 0 };
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
      day: null,
      toClose: null,
    };
  }

  const now = new Date();
  const today = schoolToday(ctx.school.timezone, now);
  const [{ data: assigned }, { data: headOf }, unread, daySessions, toClose] = await Promise.all([
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
    hasPermission(ctx, 'schedule.view') ? listMySessionsOn(ctx, teacherRow.id, today) : Promise.resolve(null),
    hasPermission(ctx, 'assessments.view')
      ? supabase
          .from('assessments')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .eq('academic_year_id', yearId)
          .eq('teacher_id', teacherRow.id)
          .in('status', ['DRAFT', 'OPEN'])
          .lte('assessment_date', today)
          .then((r) => r.count ?? 0)
      : Promise.resolve(null),
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

  const day: TeacherDayItem[] | null = daySessions
    ? daySessions.map((d) => {
        const called = d.registerStatus === 'SUBMITTED' || d.registerStatus === 'VALIDATED';
        return {
          occurrenceId: d.occurrenceId,
          klass: d.klass,
          subject: d.subject,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          called,
          phase: sessionPhase(d.startsIso, d.endsIso, called, now),
        };
      })
    : null;

  return { kind: 'teacher', classes, stats, unreadNotifications: unread, day, toClose };
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
    loadCurrentPeriod(supabase, schoolId, yearId, mainTrack(await schoolTracks(ctx))),
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

  // Uniquement SES enfants (cf. children.ts) : la securite peut en montrer davantage
  // a une personne qui cumule un autre role (enseignant, direction).
  const childIds = await myChildrenIds(ctx);
  const [{ data: studentsData }, unread] = await Promise.all([
    childIds.length === 0
      ? Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; matricule: string }[] })
      : supabase
          .from('students')
          .select('id, first_name, last_name, matricule')
          .eq('school_id', schoolId)
          .in('id', childIds)
          .is('deleted_at', null)
          .order('last_name'),
    unreadCount(ctx),
  ]);

  const students = (studentsData ?? []) as { id: string; first_name: string; last_name: string; matricule: string }[];
  const studentIds = students.map((s) => s.id);

  const enrollmentByStudent = new Map<string, { className: string }>();
  const lastAverageByStudent = new Map<string, number>();
  const absencesByStudent = new Map<string, number>();
  const latesByStudent = new Map<string, number>();
  const bulletinsByStudent = new Map<string, number>();
  const gradesByStudent = new Map<string, FamilyGrade[]>();

  const announcements = await loadFamilyAnnouncements(supabase, schoolId, ctx.membership?.roles ?? []);

  if (studentIds.length > 0 && yearId) {
    const [{ data: enrollData }, { data: reportData }, { data: absenceData }, { data: gradeData }] = await Promise.all([
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
        .eq('academic_year_id', yearId)
        .eq('status', 'PUBLISHED')
        .in('student_id', studentIds),
      supabase
        .from('attendance_records')
        .select('student_id, status')
        .eq('school_id', schoolId)
        .in('status', ['ABSENT', 'EXCUSED', 'LATE'])
        .gte('recorded_at', isoDaysAgo(30))
        .in('student_id', studentIds),
      // Notes lisibles par un parent : celles des évaluations PUBLIÉES de ses enfants (RLS).
      supabase
        .from('grades')
        .select('student_id, score, is_absent, entered_at, assessments!inner(title, max_score, assessment_date, status, academic_year_id, subjects(name))')
        .eq('school_id', schoolId)
        .in('student_id', studentIds)
        .eq('assessments.status', 'PUBLISHED')
        .eq('assessments.academic_year_id', yearId)
        .not('score', 'is', null)
        .order('entered_at', { ascending: false })
        .limit(20 * studentIds.length),
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

    for (const r of (absenceData ?? []) as { student_id: string; status: string }[]) {
      const bucket = r.status === 'LATE' ? latesByStudent : absencesByStudent;
      bucket.set(r.student_id, (bucket.get(r.student_id) ?? 0) + 1);
    }

    for (const r of (reportData ?? []) as unknown as { student_id: string }[]) {
      bulletinsByStudent.set(r.student_id, (bulletinsByStudent.get(r.student_id) ?? 0) + 1);
    }

    for (const g of (gradeData ?? []) as unknown as {
      student_id: string;
      score: number | null;
      assessments: { title: string; max_score: number; assessment_date: string | null; subjects: { name: string } | null } | null;
    }[]) {
      if (g.score === null || !g.assessments) continue;
      const list = gradesByStudent.get(g.student_id) ?? [];
      if (list.length >= 4) continue;
      list.push({
        subject: g.assessments.subjects?.name ?? g.assessments.title,
        title: g.assessments.title,
        score: Number(g.score),
        max: Number(g.assessments.max_score),
        date: g.assessments.assessment_date,
      });
      gradesByStudent.set(g.student_id, list);
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
      lates30d: latesByStudent.get(s.id) ?? 0,
      lastGrades: gradesByStudent.get(s.id) ?? [],
      bulletins: bulletinsByStudent.get(s.id) ?? 0,
    })),
    unreadNotifications: unread,
    announcements,
  };
}

/**
 * Annonces publiées qui VISENT les parents : « tout l'établissement », ou une
 * audience qui comprend l'une des fonctions de la personne (même règle que les
 * notifications, services/notifications.ts).
 */
async function loadFamilyAnnouncements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  roles: readonly string[],
): Promise<FamilyOverview['announcements']> {
  const { data } = await supabase
    .from('announcements')
    .select('id, title, body, audience, published_at, expires_at')
    .eq('school_id', schoolId)
    .eq('status', 'PUBLISHED')
    .order('published_at', { ascending: false })
    .limit(20);
  const mine = new Set(roles);
  const now = Date.now();
  return ((data ?? []) as unknown as { id: string; title: string; body: string; audience: { all?: boolean; roles?: string[] } | null; published_at: string | null; expires_at: string | null }[])
    .filter((a) => !a.expires_at || Date.parse(a.expires_at) > now)
    .filter((a) => a.audience?.all || (a.audience?.roles ?? []).some((r) => mine.has(r.toUpperCase())))
    .slice(0, 3)
    .map((a) => ({ id: a.id, title: a.title, excerpt: a.body.length > 220 ? `${a.body.slice(0, 220).trimEnd()}…` : a.body, publishedAt: a.published_at }));
}

/** Tableau de bord des espaces Enseignant et Parent (celui de la direction : staff.ts). */
export async function getDashboardData(ctx: TenantContext, space: Exclude<Space, 'school'>): Promise<DashboardData> {
  if (space === 'teacher') return loadTeacherOverview(ctx);
  return loadFamilyOverview(ctx);
}
