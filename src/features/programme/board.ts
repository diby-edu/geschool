import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { getConfigForCycle } from '@/features/schedule/config';
import { toSessions } from './hours';

/**
 * Deux vues d'ensemble du programme, pour ne plus avancer à l'aveugle.
 *
 *   « Matières par niveau »      où en est chaque niveau : combien de matières,
 *                                quel coefficient total, combien de classes.
 *   « Gestion des coefficients » le tableau croisé matières × niveaux, où l'on
 *                                compare et corrige vite.
 *
 * Les deux lisent les mêmes données ; ce qui change, c'est le sens de lecture.
 */

/** Une matière au programme d'un niveau, telle qu'on la lit dans le dépliant. */
export type LevelProgressItem = {
  subjectId: string;
  code: string;
  name: string;
  coefficient: number;
  weeklyMinutes: number;
  mandatory: boolean;
};

export type LevelProgress = {
  levelId: string;
  code: string;
  name: string;
  track: string;
  diploma: string | null;
  sequence: number;
  subjects: number;
  totalCoefficient: number;
  classes: number;
  /** Le détail, pour le dépliant de la carte : inutile d'ouvrir le niveau pour voir. */
  items: LevelProgressItem[];
};

export type CoefficientMatrix = {
  levels: {
    id: string;
    code: string;
    name: string;
    track: string;
    sequence: number;
    classes: number;
    /** Durée d'une séance pour ce niveau : 55 min, 60 min… */
    sessionMinutes: number;
  }[];
  subjects: { id: string; code: string; name: string; tracks: string[] }[];
  /** `${levelId}:${subjectId}` -> coefficient. Absent = matière non enseignée. */
  cells: Record<string, number>;
  /** `${levelId}:${subjectId}` -> séances hebdomadaires. 0 = aucune séance. */
  sessions: Record<string, number>;
};

type LevelRow = { id: string; code: string; name: string; cycle_id: string; sequence: number; diploma: string | null };
type EntryRow = {
  level_id: string;
  subject_id: string;
  coefficient: number;
  weekly_minutes: number;
  is_mandatory: boolean;
};
type SubjectRow = { id: string; code: string; name: string; tracks: string[] | null };

async function loadStructure(ctx: TenantContext) {
  const supabase = await createClient();
  const yearId = ctx.academicYear?.id ?? null;
  const [{ data: levels }, { data: cycles }, { data: entries }, { data: classes }, { data: subjects }] = await Promise.all([
    supabase.from('levels').select('id, code, name, cycle_id, sequence, diploma').eq('school_id', ctx.school.id),
    supabase.from('cycles').select('id, track').eq('school_id', ctx.school.id),
    supabase
      .from('level_subjects')
      .select('level_id, subject_id, coefficient, weekly_minutes, is_mandatory')
      .eq('school_id', ctx.school.id),
    yearId
      ? supabase
          .from('classes')
          .select('level_id')
          .eq('school_id', ctx.school.id)
          .eq('academic_year_id', yearId)
          .eq('status', 'ACTIVE')
      : Promise.resolve({ data: [] as { level_id: string }[] }),
    supabase
      .from('subjects')
      .select('id, code, name, tracks')
      .eq('school_id', ctx.school.id)
      .eq('is_active', true)
      .order('name'),
  ]);

  const trackByCycle = new Map(
    ((cycles ?? []) as { id: string; track: string | null }[]).map((c) => [c.id, c.track ?? 'GENERAL']),
  );
  return {
    levels: (levels ?? []) as LevelRow[],
    trackByCycle,
    entries: (entries ?? []) as EntryRow[],
    classes: (classes ?? []) as { level_id: string }[],
    subjects: (subjects ?? []) as SubjectRow[],
  };
}

/** Où en est chaque niveau : le tableau de bord du programme. */
export async function listLevelProgress(ctx: TenantContext): Promise<LevelProgress[]> {
  const { levels, trackByCycle, entries, classes, subjects } = await loadStructure(ctx);

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const byLevel = new Map<string, LevelProgressItem[]>();
  for (const e of entries) {
    const subject = subjectById.get(e.subject_id);
    // Une matière désactivée depuis reste en base : on ne l'affiche plus.
    if (!subject) continue;
    const list = byLevel.get(e.level_id) ?? [];
    list.push({
      subjectId: e.subject_id,
      code: subject.code,
      name: subject.name,
      coefficient: Number(e.coefficient),
      weeklyMinutes: e.weekly_minutes,
      mandatory: e.is_mandatory,
    });
    byLevel.set(e.level_id, list);
  }
  const classCount = new Map<string, number>();
  for (const c of classes) classCount.set(c.level_id, (classCount.get(c.level_id) ?? 0) + 1);

  const order: Record<string, number> = { GENERAL: 0, TECHNIQUE: 1, PROFESSIONNEL: 2 };
  return levels
    .map((l) => {
      // Les obligatoires d'abord, puis par nom : on lit le tronc commun en tête.
      const items = (byLevel.get(l.id) ?? []).sort(
        (a, b) => Number(b.mandatory) - Number(a.mandatory) || a.name.localeCompare(b.name, 'fr'),
      );
      const total = items.reduce((sum, i) => sum + i.coefficient, 0);
      return {
        levelId: l.id,
        code: l.code,
        name: l.name,
        track: trackByCycle.get(l.cycle_id) ?? 'GENERAL',
        diploma: l.diploma,
        sequence: l.sequence,
        subjects: items.length,
        totalCoefficient: Math.round(total * 100) / 100,
        classes: classCount.get(l.id) ?? 0,
        items,
      };
    })
    .sort((a, b) => (order[a.track] ?? 9) - (order[b.track] ?? 9) || a.sequence - b.sequence || a.name.localeCompare(b.name, 'fr'));
}

/** Le tableau croisé : matières en lignes, niveaux en colonnes. */
export async function getCoefficientMatrix(ctx: TenantContext, track?: string): Promise<CoefficientMatrix> {
  const { levels, trackByCycle, entries, classes, subjects } = await loadStructure(ctx);

  // L'ordre des colonnes suit celui de l'école, jamais l'alphabet :
  //   1. l'ordre d'enseignement — général, puis technique, puis professionnel,
  //      sans jamais les mélanger ;
  //   2. les niveaux où des CLASSES existent d'abord, car ce sont ceux qu'on
  //      remplit vraiment cette année ;
  //   3. la progression pédagogique (6e, 5e, 4e…), pas le nom.
  const classCount = new Map<string, number>();
  for (const c of classes) classCount.set(c.level_id, (classCount.get(c.level_id) ?? 0) + 1);
  const rank: Record<string, number> = { GENERAL: 0, TECHNIQUE: 1, PROFESSIONNEL: 2 };

  // Une séance ne dure pas la même chose partout : le premier cycle peut avoir
  // des créneaux de 55 min et le second de 60. On résout par cycle, une fois.
  const slotByCycle = await sessionMinutesByCycle(ctx, [...new Set(levels.map((l) => l.cycle_id))]);

  const withTrack = levels
    .map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      sequence: l.sequence,
      track: trackByCycle.get(l.cycle_id) ?? 'GENERAL',
      classes: classCount.get(l.id) ?? 0,
      sessionMinutes: slotByCycle.get(l.cycle_id) ?? 60,
    }))
    .filter((l) => !track || l.track === track)
    .sort(
      (a, b) =>
        (rank[a.track] ?? 9) - (rank[b.track] ?? 9) ||
        (b.classes > 0 ? 1 : 0) - (a.classes > 0 ? 1 : 0) ||
        a.sequence - b.sequence ||
        a.name.localeCompare(b.name, 'fr', { numeric: true }),
    );

  const rows = subjects
    .map((s) => ({ id: s.id, code: s.code, name: s.name, tracks: s.tracks ?? [] }))
    .filter((s) => !track || s.tracks.length === 0 || s.tracks.includes(track));

  const shown = new Map(withTrack.map((l) => [l.id, l.sessionMinutes]));
  const cells: Record<string, number> = {};
  const sessions: Record<string, number> = {};
  for (const e of entries) {
    const slot = shown.get(e.level_id);
    if (slot === undefined) continue;
    const key = `${e.level_id}:${e.subject_id}`;
    cells[key] = Number(e.coefficient);
    sessions[key] = toSessions(e.weekly_minutes, slot);
  }

  return { levels: withTrack, subjects: rows, cells, sessions };
}

/** Durée d'un créneau par cycle, avec repli sur l'heure pleine. */
async function sessionMinutesByCycle(ctx: TenantContext, cycleIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const yearId = ctx.academicYear?.id;
  if (!yearId) return out;
  for (const id of cycleIds) {
    const config = await getConfigForCycle(ctx, yearId, id);
    const minutes = config?.default_session_minutes;
    if (minutes && minutes > 0) out.set(id, minutes);
  }
  return out;
}
