import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { sessionMinutesForLevel } from '@/features/programme/service';
import { readServiceDefaults } from '@/features/teachers/service-defaults';
import { effectiveBounds } from '@/features/teachers/service-types';

/**
 * La grille des affectations : qui enseigne quoi, à quelle classe.
 *
 * On choisit un NIVEAU, et l'on obtient ses classes en lignes, les matières de
 * son programme en colonnes. Une case = un enseignant. C'est la seule façon de
 * remplir seize sixièmes sans ouvrir seize formulaires, et de voir d'un coup
 * ce qui manque.
 *
 * Le volume horaire ne se saisit plus : il vient du programme du niveau.
 */

export type GridLevel = { id: string; code: string; name: string; track: string; classes: number };

export type GridSubject = { id: string; code: string; name: string; weeklyMinutes: number; coefficient: number };

export type GridClass = { id: string; code: string; name: string };

export type AssignmentGrid = {
  levels: GridLevel[];
  classes: GridClass[];
  subjects: GridSubject[];
  /** `${classId}:${subjectId}` -> teacherId */
  cells: Record<string, string>;
  teachers: TeacherLoad[];
  /** Durée d'une séance dans ce cycle : sert à exprimer la charge en séances. */
  sessionMinutes: number;
};

/**
 * La charge d'un enseignant, tous niveaux confondus.
 *
 * Elle se lit AVANT la génération de l'emploi du temps : découvrir qu'un
 * professeur a vingt-quatre heures au moment où le solveur échoue est trop
 * tard, et le message d'erreur ne dit pas qui est en cause.
 */
export type TeacherLoad = {
  id: string;
  name: string;
  subjectIds: string[];
  /**
   * Nombre de cours confiés — classes ET groupes. Un TP en demi-classe compte
   * dans le service d'un enseignant au même titre qu'un cours en classe
   * entière : l'ignorer sous-compterait sa charge sans que rien ne le signale.
   */
  courses: number;
  /** Total hebdomadaire, en minutes, repris du programme de chaque niveau. */
  minutes: number;
  /**
   * Service minimum et maximum qui s'appliquent : ceux de sa fiche, ou à défaut
   * ceux de son type de contrat réglés pour l'établissement.
   */
  minMinutes: number | null;
  maxMinutes: number | null;
  /** Vrai quand les bornes viennent du contrat et non de la fiche. */
  fromDefault: boolean;
};

const TRACK_RANK: Record<string, number> = { GENERAL: 0, TECHNIQUE: 1, PROFESSIONNEL: 2 };

/** Les niveaux proposés dans le sélecteur : ceux qui ont des classes d'abord. */
export async function listGridLevels(ctx: TenantContext): Promise<GridLevel[]> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return [];
  const supabase = await createClient();

  const [{ data: levels }, { data: cycles }, { data: classes }] = await Promise.all([
    supabase.from('levels').select('id, code, name, cycle_id, sequence').eq('school_id', ctx.school.id),
    supabase.from('cycles').select('id, track').eq('school_id', ctx.school.id),
    supabase
      .from('classes')
      .select('level_id')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('status', 'ACTIVE'),
  ]);

  const trackByCycle = new Map(((cycles ?? []) as { id: string; track: string | null }[]).map((c) => [c.id, c.track ?? 'GENERAL']));
  const count = new Map<string, number>();
  for (const c of (classes ?? []) as { level_id: string }[]) count.set(c.level_id, (count.get(c.level_id) ?? 0) + 1);

  return ((levels ?? []) as { id: string; code: string; name: string; cycle_id: string; sequence: number }[])
    .map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      track: trackByCycle.get(l.cycle_id) ?? 'GENERAL',
      classes: count.get(l.id) ?? 0,
      sequence: l.sequence,
    }))
    .sort(
      (a, b) =>
        (TRACK_RANK[a.track] ?? 9) - (TRACK_RANK[b.track] ?? 9) ||
        (b.classes > 0 ? 1 : 0) - (a.classes > 0 ? 1 : 0) ||
        a.sequence - b.sequence ||
        a.name.localeCompare(b.name, 'fr', { numeric: true }),
    )
    .map(({ id, code, name, track, classes: n }) => ({ id, code, name, track, classes: n }));
}

/** La grille d'un niveau : ses classes, les matières de son programme, et qui les assure. */
export async function getAssignmentGrid(ctx: TenantContext, levelId: string): Promise<AssignmentGrid> {
  const yearId = ctx.academicYear?.id;
  const levels = await listGridLevels(ctx);
  const empty: AssignmentGrid = { levels, classes: [], subjects: [], cells: {}, teachers: [], sessionMinutes: 60 };
  if (!yearId || !levelId) return empty;

  const supabase = await createClient();
  const [sessionMinutes, serviceDefaults] = await Promise.all([
    sessionMinutesForLevel(ctx, levelId),
    readServiceDefaults(ctx),
  ]);
  const [{ data: classes }, { data: programme }, { data: teacherRows }, { data: assignments }] = await Promise.all([
    supabase
      .from('classes')
      .select('id, code, name')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('level_id', levelId)
      .eq('status', 'ACTIVE')
      .order('code'),
    supabase
      .from('level_subjects')
      .select('subject_id, coefficient, weekly_minutes, subjects(code, name)')
      .eq('school_id', ctx.school.id)
      .eq('level_id', levelId),
    supabase
      .from('teachers')
      .select('id, first_name, last_name, employment_type, weekly_minutes_min, weekly_minutes_max, teacher_subjects(subject_id)')
      .eq('school_id', ctx.school.id)
      .is('deleted_at', null)
      .order('last_name'),
    supabase
      .from('teaching_assignments')
      .select('id, teacher_id, subject_id, class_id, group_id, weekly_minutes')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('status', 'ACTIVE'),
  ]);

  const subjects: GridSubject[] = ((programme ?? []) as unknown as {
    subject_id: string;
    coefficient: number;
    weekly_minutes: number;
    subjects: { code: string; name: string } | null;
  }[])
    .map((r) => ({
      id: r.subject_id,
      code: r.subjects?.code ?? '—',
      name: r.subjects?.name ?? '—',
      weeklyMinutes: r.weekly_minutes,
      coefficient: Number(r.coefficient),
    }))
    .sort((a, b) => b.coefficient - a.coefficient || a.name.localeCompare(b.name, 'fr'));

  const classIds = new Set(((classes ?? []) as { id: string }[]).map((c) => c.id));
  const cells: Record<string, string> = {};
  const courseCount: Record<string, number> = {};
  const minuteCount: Record<string, number> = {};
  for (const a of (assignments ?? []) as {
    teacher_id: string;
    subject_id: string;
    class_id: string | null;
    group_id: string | null;
    weekly_minutes: number;
  }[]) {
    // Classe OU groupe : les deux pèsent sur le service.
    if (!a.class_id && !a.group_id) continue;
    courseCount[a.teacher_id] = (courseCount[a.teacher_id] ?? 0) + 1;
    minuteCount[a.teacher_id] = (minuteCount[a.teacher_id] ?? 0) + a.weekly_minutes;
    // La grille, elle, ne montre que les classes : un groupe n'y a pas de colonne.
    if (a.class_id && classIds.has(a.class_id)) cells[`${a.class_id}:${a.subject_id}`] = a.teacher_id;
  }

  const teachers: TeacherLoad[] = ((teacherRows ?? []) as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    employment_type: string;
    weekly_minutes_min: number | null;
    weekly_minutes_max: number | null;
    teacher_subjects: { subject_id: string }[];
  }[]).map((t) => {
    const bounds = effectiveBounds(t, serviceDefaults, sessionMinutes);
    return {
      id: t.id,
      name: `${t.last_name.toUpperCase()} ${t.first_name}`,
      subjectIds: (t.teacher_subjects ?? []).map((s) => s.subject_id),
      courses: courseCount[t.id] ?? 0,
      minutes: minuteCount[t.id] ?? 0,
      ...bounds,
    };
  });

  return {
    levels,
    classes: (classes ?? []) as GridClass[],
    subjects,
    cells,
    teachers,
    sessionMinutes,
  };
}
