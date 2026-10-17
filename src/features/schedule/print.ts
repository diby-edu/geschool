import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { colorsFor, layoutTimetable, type Band, type PrintItem, type PrintSheet } from './print-layout';

/**
 * Emplois du temps à imprimer (une feuille A4 paysage chacun) : classes ou
 * enseignants, un ou plusieurs, de la version PUBLIÉE de l'année — celle qui
 * est en service. Tout l'établissement se charge en quelques lectures
 * (cours, grilles, classes, enseignants), quel que soit le nombre de feuilles.
 */

export type PrintChoices = {
  versionName: string | null;
  classes: { id: string; name: string; level: string | null }[];
  teachers: { id: string; name: string; detail: string }[];
};

type SessionRaw = {
  id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  subjects: { name: string } | null;
  schedule_session_teachers: { teacher_id: string }[];
  schedule_session_targets: { class_id: string | null; group_id: string | null; groups: { name: string } | null }[];
  schedule_session_rooms: { rooms: { code: string; name: string } | null }[];
};

const personName = (t: { first_name: string; last_name: string }) => `${t.last_name.toUpperCase()} ${t.first_name}`;
const byNatural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

async function publishedVersion(ctx: TenantContext) {
  if (!ctx.academicYear) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_versions')
    .select('id, name')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', ctx.academicYear.id)
    .eq('status', 'PUBLISHED')
    .maybeSingle();
  return data;
}

async function loadClasses(ctx: TenantContext, yearId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, head_teacher_id, levels(name, sequence, cycle_id)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE');
  if (error) throw error;
  return ((data ?? []) as unknown as {
    id: string;
    name: string;
    head_teacher_id: string | null;
    levels: { name: string; sequence: number; cycle_id: string | null } | null;
  }[]).sort((a, b) => (a.levels?.sequence ?? 99) - (b.levels?.sequence ?? 99) || byNatural(a.name, b.name));
}

async function loadTeachers(ctx: TenantContext) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('teachers')
    .select('id, first_name, last_name, status, staff_number, specialty')
    .eq('school_id', ctx.school.id)
    .is('deleted_at', null);
  if (error) throw error;
  return (data ?? []) as { id: string; first_name: string; last_name: string; status: string; staff_number: string | null; specialty: string | null }[];
}

/** Ce qu'on peut cocher : les classes et enseignants de l'emploi du temps en service. */
export async function loadPrintChoices(ctx: TenantContext): Promise<PrintChoices> {
  const version = await publishedVersion(ctx);
  if (!version || !ctx.academicYear) return { versionName: null, classes: [], teachers: [] };
  const [classes, teachers] = await Promise.all([loadClasses(ctx, ctx.academicYear.id), loadTeachers(ctx)]);
  return {
    versionName: version.name,
    classes: classes.map((c) => ({ id: c.id, name: c.name, level: c.levels?.name ?? null })),
    teachers: teachers
      .filter((t) => t.status === 'ACTIVE')
      // Homonymes fréquents (trois « BAMBA Adjoua ») : spécialité et matricule pour les distinguer.
      .map((t) => ({ id: t.id, name: personName(t), detail: [t.specialty, t.staff_number].filter(Boolean).join(' · ') }))
      .sort((a, b) => byNatural(a.name, b.name)),
  };
}

export async function buildPrintSheets(
  ctx: TenantContext,
  want: { classIds: string[]; teacherIds: string[] },
): Promise<{ versionName: string | null; sheets: PrintSheet[] }> {
  const version = await publishedVersion(ctx);
  if (!version || !ctx.academicYear) return { versionName: null, sheets: [] };
  const yearId = ctx.academicYear.id;
  const supabase = await createClient();

  const [sessions, classes, teachers, { data: configs }] = await Promise.all([
    fetchAllRows<SessionRaw>((cursor) => {
      let q = supabase
        .from('schedule_sessions')
        .select(
          'id, day_of_week, starts_at, ends_at, subjects(name), schedule_session_teachers(teacher_id), ' +
            'schedule_session_targets(class_id, group_id, groups(name)), schedule_session_rooms(rooms(code, name))',
        )
        .eq('school_id', ctx.school.id)
        .eq('schedule_version_id', version.id)
        .order('id')
        .limit(1000);
      if (cursor) q = q.gt('id', cursor);
      return q as unknown as PromiseLike<{ data: SessionRaw[] | null; error: { message: string } | null }>;
    }),
    loadClasses(ctx, yearId),
    loadTeachers(ctx),
    supabase
      .from('schedule_configurations')
      .select('id, cycle_id, working_days')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('is_default', true),
  ]);

  // Grilles horaires : celle de l'établissement, et celles des cycles qui en ont une.
  const cfgs = (configs ?? []) as { id: string; cycle_id: string | null; working_days: number[] }[];
  const { data: slotRows } = cfgs.length
    ? await supabase
        .from('time_slots')
        .select('schedule_configuration_id, day_of_week, starts_at, ends_at, kind, label')
        .eq('school_id', ctx.school.id)
        .in(
          'schedule_configuration_id',
          cfgs.map((c) => c.id),
        )
    : { data: [] };
  const bandsOf = new Map<string, Band[]>();
  for (const s of (slotRows ?? []) as {
    schedule_configuration_id: string;
    day_of_week: number;
    starts_at: string;
    ends_at: string;
    kind: string;
    label: string | null;
  }[]) {
    const list = bandsOf.get(s.schedule_configuration_id) ?? [];
    list.push({
      day: s.day_of_week,
      start: s.starts_at,
      end: s.ends_at,
      kind: s.kind === 'TEACHING' ? 'TEACHING' : 'PAUSE',
      label: s.label ?? (s.kind === 'LUNCH' ? 'Pause déjeuner' : s.kind === 'TEACHING' ? undefined : 'Récréation'),
    });
    bandsOf.set(s.schedule_configuration_id, list);
  }
  const defaultCfg = cfgs.find((c) => c.cycle_id === null) ?? null;
  const cfgOfClass = (cycleId: string | null | undefined) => cfgs.find((c) => c.cycle_id !== null && c.cycle_id === cycleId) ?? defaultCfg;

  // Un cours de groupe (LV2, option) figure sur l'emploi du temps de chacune de ses classes.
  const groupIds = [...new Set(sessions.flatMap((s) => s.schedule_session_targets.map((t) => t.group_id).filter((g): g is string => !!g)))];
  const classesOfGroup = new Map<string, string[]>();
  if (groupIds.length) {
    const { data: links } = await supabase.from('group_classes').select('group_id, class_id').eq('school_id', ctx.school.id).in('group_id', groupIds);
    for (const l of links ?? []) classesOfGroup.set(l.group_id, [...(classesOfGroup.get(l.group_id) ?? []), l.class_id]);
  }

  const classById = new Map(classes.map((c) => [c.id, c]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const room = (s: SessionRaw) => s.schedule_session_rooms.map((r) => r.rooms?.name || r.rooms?.code).filter(Boolean).join(' + ');
  const subject = (s: SessionRaw) => s.subjects?.name ?? 'Cours';
  const classesOf = (s: SessionRaw) => {
    const ids = new Set<string>();
    for (const t of s.schedule_session_targets) {
      if (t.class_id) ids.add(t.class_id);
      if (t.group_id) for (const c of classesOfGroup.get(t.group_id) ?? []) ids.add(c);
    }
    return [...ids];
  };
  const groupLabel = (s: SessionRaw) => s.schedule_session_targets.map((t) => t.groups?.name).filter(Boolean).join(', ');

  const sheets: PrintSheet[] = [];
  const schoolLines = [ctx.school.name, `Année scolaire ${ctx.academicYear.name}`];

  for (const classId of want.classIds) {
    const c = classById.get(classId);
    if (!c) continue;
    const cfg = cfgOfClass(c.levels?.cycle_id);
    const items: PrintItem[] = sessions
      .filter((s) => classesOf(s).includes(classId))
      .map((s) => {
        const names = s.schedule_session_teachers.map((t) => teacherById.get(t.teacher_id)).filter(Boolean).map((t) => personName(t!));
        const g = groupLabel(s);
        return {
          day: s.day_of_week,
          start: s.starts_at,
          end: s.ends_at,
          title: g ? `${subject(s)} (${g})` : subject(s),
          lines: [names.join(', '), room(s)].filter(Boolean),
          colorKey: subject(s),
        };
      });
    const layout = layoutTimetable(cfg?.working_days ?? [1, 2, 3, 4, 5], cfg ? (bandsOf.get(cfg.id) ?? []) : [], items);
    const head = c.head_teacher_id ? teacherById.get(c.head_teacher_id) : undefined;
    sheets.push({
      id: `c-${c.id}`,
      title: `Emploi du temps — ${c.name}`,
      subtitle: `Semaine type · ${layout.totalHours} h de cours par semaine`,
      right: [...schoolLines, head ? `Professeur principal : ${personName(head)}` : 'Professeur principal : non désigné'],
      layout,
      colors: Object.fromEntries(colorsFor(items.map((i) => i.colorKey))),
      colorMeaning: 'Couleur = matière.',
    });
  }

  for (const teacherId of want.teacherIds) {
    const t = teacherById.get(teacherId);
    if (!t) continue;
    const mine = sessions.filter((s) => s.schedule_session_teachers.some((x) => x.teacher_id === teacherId));
    const items: PrintItem[] = mine.map((s) => {
      const names = classesOf(s)
        .map((id) => classById.get(id)?.name)
        .filter((n): n is string => !!n)
        .sort(byNatural);
      const g = groupLabel(s);
      const who = g ? `${g}${names.length ? ` (${names.join(', ')})` : ''}` : names.join(' + ') || 'Classe';
      return { day: s.day_of_week, start: s.starts_at, end: s.ends_at, title: who, lines: [subject(s), room(s)].filter(Boolean), colorKey: who };
    });
    // Ses classes peuvent suivre des grilles de cycle différentes : on réunit leurs créneaux.
    const cfgIds = new Set<string>();
    for (const s of mine) for (const id of classesOf(s)) {
      const cfg = cfgOfClass(classById.get(id)?.levels?.cycle_id);
      if (cfg) cfgIds.add(cfg.id);
    }
    if (cfgIds.size === 0 && defaultCfg) cfgIds.add(defaultCfg.id);
    const bands = [...cfgIds].flatMap((id) => bandsOf.get(id) ?? []);
    const days = [...new Set([...cfgIds].flatMap((id) => cfgs.find((c) => c.id === id)?.working_days ?? []))].sort();
    const layout = layoutTimetable(days.length ? days : [1, 2, 3, 4, 5], bands, items);
    const subjects = [...new Set(mine.map(subject))].sort(byNatural);
    const ppOf = classes.filter((c) => c.head_teacher_id === teacherId).map((c) => c.name);
    sheets.push({
      id: `t-${t.id}`,
      title: `Emploi du temps — ${personName(t)}`,
      subtitle: `Semaine type · ${layout.totalHours} h de cours par semaine`,
      right: [
        ...schoolLines,
        `Matière(s) : ${subjects.join(', ') || '—'}`,
        ...(ppOf.length ? [`Professeur principal de la ${ppOf.join(', ')}`] : []),
      ],
      layout,
      colors: Object.fromEntries(colorsFor(items.map((i) => i.colorKey))),
      colorMeaning: 'Couleur = classe.',
    });
  }

  return { versionName: version.name, sheets };
}
