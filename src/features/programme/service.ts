import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { planCounts, planProgramme, type ExistingEntry, type ProgrammeRow } from './plan';
import { getConfig, getConfigForCycle } from '@/features/schedule/config';
import {
  OFFICIAL_CI_CYCLES,
  OFFICIAL_CI_LEVELS,
  OFFICIAL_CI_PROGRAMME,
  OFFICIAL_CI_SUBJECTS,
  mostFrequentCoefficient,
} from './official-ci';

/**
 * Durée d'une séance pour un niveau donné : celle de la grille horaire de son
 * cycle, sinon celle de l'établissement, sinon une heure pleine. C'est elle qui
 * traduit « 5 séances » en minutes, et inversement à l'affichage.
 */
export async function sessionMinutesForLevel(ctx: TenantContext, levelId: string): Promise<number> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return DEFAULT_SESSION_MINUTES;
  const supabase = await createClient();
  const { data } = await supabase
    .from('levels')
    .select('cycle_id')
    .eq('school_id', ctx.school.id)
    .eq('id', levelId)
    .maybeSingle();
  const config = data?.cycle_id ? await getConfigForCycle(ctx, yearId, data.cycle_id) : await getConfig(ctx, yearId);
  const minutes = config?.default_session_minutes;
  return minutes && minutes > 0 ? minutes : DEFAULT_SESSION_MINUTES;
}

export type ProgrammeSave = { added: number; changed: number; removed: number };

/**
 * Enregistre le programme d'un NIVEAU en une fois : toutes les matières de son
 * ordre d'enseignement arrivent, cochées ou non.
 *
 * On ne réécrit que ce qui a bougé — décocher retire la matière du niveau,
 * cocher l'ajoute, et une ligne inchangée n'est pas touchée. Le résultat
 * alimente `level_subjects`, la table que lisent aussi le tableau croisé des
 * coefficients, la grille d'affectation des enseignants et les bulletins.
 */
export async function saveLevelProgramme(
  ctx: TenantContext,
  levelId: string,
  rows: ProgrammeRow[],
): Promise<ProgrammeSave> {
  requireWritable(ctx, 'subjects.update');
  if (!levelId) throw new ValidationError('Niveau requis.');
  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from('level_subjects')
    .select('id, subject_id, coefficient, weekly_minutes, is_mandatory')
    .eq('school_id', ctx.school.id)
    .eq('level_id', levelId);
  if (readError) throw readError;

  const existing: ExistingEntry[] = ((current ?? []) as {
    id: string;
    subject_id: string;
    coefficient: number;
    weekly_minutes: number;
    is_mandatory: boolean;
  }[]).map((r) => ({
    id: r.id,
    subjectId: r.subject_id,
    coefficient: Number(r.coefficient),
    weeklyMinutes: r.weekly_minutes,
    mandatory: r.is_mandatory,
  }));

  const plan = planProgramme(existing, rows);

  if (plan.upsert.length > 0) {
    const { error } = await supabase.from('level_subjects').upsert(
      plan.upsert.map((u) => ({
        school_id: ctx.school.id,
        level_id: levelId,
        subject_id: u.subjectId,
        coefficient: u.coefficient,
        weekly_minutes: u.weeklyMinutes,
        is_mandatory: u.mandatory,
      })),
      { onConflict: 'level_id,subject_id' },
    );
    if (error) throw error;
  }
  if (plan.removeIds.length > 0) {
    const { error } = await supabase
      .from('level_subjects')
      .delete()
      .eq('school_id', ctx.school.id)
      .in('id', plan.removeIds);
    if (error) throw error;
  }

  const result = planCounts(plan);
  if (plan.upsert.length > 0 || plan.removeIds.length > 0) {
    await audit(ctx, {
      action: 'programme.level_save',
      module: 'programme',
      entityType: 'level',
      entityId: levelId,
      after: result,
    });
  }
  return result;
}

/** Durée d'une séance quand l'école n'a pas encore réglé sa grille horaire. */
const DEFAULT_SESSION_MINUTES = 60;

/**
 * Durée d'un créneau, par code de cycle officiel (CYCLE1, CYCLE2).
 *
 * Un établissement peut donner au premier cycle des créneaux de 55 min et au
 * second de 60 : la conversion des séances en minutes doit suivre. Sans année
 * active ni grille, on retombe sur une heure pleine — l'école corrigera, et
 * tout reste modifiable ensuite.
 */
async function sessionMinutesByCycle(
  ctx: TenantContext,
  cycleIds: Map<string, string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const yearId = ctx.academicYear?.id;
  if (!yearId) return out;
  for (const [code, id] of cycleIds) {
    const config = await getConfigForCycle(ctx, yearId, id);
    const minutes = config?.default_session_minutes;
    if (minutes && minutes > 0) out.set(code, minutes);
  }
  return out;
}

export type OfficialProgrammeResult = { cycles: number; levels: number; subjects: number; entries: number };

/**
 * Charge la grille officielle ivoirienne (official-ci.ts) : cycles, niveaux,
 * matieres et coefficients. N'AJOUTE que ce qui manque, reconnu par son code :
 * un niveau, une matiere ou un coefficient deja present n'est jamais modifie (un
 * coefficient ajuste par l'etablissement reste le sien). Rejouable sans effet.
 *
 * Ecritures avec les droits de l'utilisateur (RLS) : les memes droits que pour
 * creer ces elements a la main.
 */
export async function applyOfficialProgramme(ctx: TenantContext): Promise<OfficialProgrammeResult> {
  requireWritable(ctx, 'cycles.manage');
  requireWritable(ctx, 'levels.manage');
  requireWritable(ctx, 'subjects.create');
  requireWritable(ctx, 'subjects.update');
  const supabase = await createClient();
  const schoolId = ctx.school.id;
  const result: OfficialProgrammeResult = { cycles: 0, levels: 0, subjects: 0, entries: 0 };

  // 1. Cycles
  const { data: cycles, error: cyclesError } = await supabase.from('cycles').select('id, code').eq('school_id', schoolId);
  if (cyclesError) throw cyclesError;
  const cycleIds = new Map((cycles ?? []).map((c) => [c.code, c.id]));
  const newCycles = OFFICIAL_CI_CYCLES.filter((c) => !cycleIds.has(c.code));
  if (newCycles.length > 0) {
    const { data, error } = await supabase
      .from('cycles')
      .insert(newCycles.map((c) => ({ school_id: schoolId, code: c.code, name: c.name, sequence: c.sequence })))
      .select('id, code');
    if (error) throw error;
    for (const c of data ?? []) cycleIds.set(c.code, c.id);
    result.cycles = newCycles.length;
  }

  // 2. Niveaux (un par serie)
  const { data: levels, error: levelsError } = await supabase.from('levels').select('id, code').eq('school_id', schoolId);
  if (levelsError) throw levelsError;
  const levelIds = new Map((levels ?? []).map((l) => [l.code, l.id]));
  const newLevels = OFFICIAL_CI_LEVELS.filter((l) => !levelIds.has(l.code));
  if (newLevels.length > 0) {
    const { data, error } = await supabase
      .from('levels')
      .insert(
        newLevels.map((l) => ({
          school_id: schoolId,
          cycle_id: cycleIds.get(l.cycle)!,
          code: l.code,
          name: l.name,
          sequence: l.sequence,
        })),
      )
      .select('id, code');
    if (error) throw error;
    for (const l of data ?? []) levelIds.set(l.code, l.id);
    result.levels = newLevels.length;
  }

  // 3. Matieres
  const { data: subjects, error: subjectsError } = await supabase.from('subjects').select('id, code').eq('school_id', schoolId);
  if (subjectsError) throw subjectsError;
  const subjectIds = new Map((subjects ?? []).map((s) => [s.code, s.id]));
  const newSubjects = OFFICIAL_CI_SUBJECTS.filter((s) => !subjectIds.has(s.code));
  if (newSubjects.length > 0) {
    const { data, error } = await supabase
      .from('subjects')
      .insert(
        newSubjects.map((s) => ({
          school_id: schoolId,
          code: s.code,
          name: s.name,
          short_name: s.shortName,
          category: s.category ?? null,
          default_coefficient: mostFrequentCoefficient(s.code),
        })),
      )
      .select('id, code');
    if (error) throw error;
    for (const s of data ?? []) subjectIds.set(s.code, s.id);
    result.subjects = newSubjects.length;
  }

  // 4. Coefficients : seulement les couples (niveau, matiere) absents
  const officialLevelIds = OFFICIAL_CI_LEVELS.map((l) => levelIds.get(l.code)!);
  const { data: existing, error: existingError } = await supabase
    .from('level_subjects')
    .select('level_id, subject_id')
    .eq('school_id', schoolId)
    .in('level_id', officialLevelIds);
  if (existingError) throw existingError;
  const present = new Set((existing ?? []).map((e) => `${e.level_id}:${e.subject_id}`));

  // Le document compte des SÉANCES, pas des heures d'horloge : « Français 5 »,
  // c'est cinq séances. Une séance dure ce que dure un créneau de cette école —
  // 55 min chez l'une, 60 chez l'autre — et la durée peut différer par cycle.
  // On convertit ici, contre la grille horaire réelle ; faute de grille, 60 min.
  const slotByCycle = await sessionMinutesByCycle(ctx, cycleIds);

  const rows = OFFICIAL_CI_LEVELS.flatMap((level) =>
    Object.entries(OFFICIAL_CI_PROGRAMME[level.code] ?? {}).map(([subjectCode, entry]) => ({
      school_id: schoolId,
      level_id: levelIds.get(level.code)!,
      subject_id: subjectIds.get(subjectCode)!,
      coefficient: entry.coefficient,
      weekly_minutes: entry.sessions * (slotByCycle.get(level.cycle) ?? DEFAULT_SESSION_MINUTES),
      is_mandatory: !entry.optional,
    })),
  ).filter((r) => !present.has(`${r.level_id}:${r.subject_id}`));
  if (rows.length > 0) {
    const { error } = await supabase.from('level_subjects').insert(rows);
    if (error) throw error;
    result.entries = rows.length;
  }

  await audit(ctx, {
    action: 'programme.apply_official',
    module: 'programme',
    entityType: 'school',
    entityId: schoolId,
    after: { grille: 'CI_SECONDAIRE_GENERAL', ...result },
  });
  return result;
}

export type MatrixSave = { changed: number; removed: number };

/**
 * Enregistre le tableau croisé des coefficients.
 *
 * On ne réécrit que ce qui a bougé : une case vidée retire la matière du
 * programme du niveau, une case remplie l'ajoute ou corrige son coefficient.
 * Le volume horaire déjà saisi n'est jamais écrasé — il se règle niveau par
 * niveau, là où on voit la semaine entière.
 */
export async function saveCoefficientMatrix(
  ctx: TenantContext,
  cells: { levelId: string; subjectId: string; coefficient: number | null }[],
): Promise<MatrixSave> {
  requireWritable(ctx, 'subjects.update');
  const supabase = await createClient();

  const { data: current } = await supabase
    .from('level_subjects')
    .select('id, level_id, subject_id, coefficient')
    .eq('school_id', ctx.school.id);
  const existing = new Map(
    ((current ?? []) as { id: string; level_id: string; subject_id: string; coefficient: number }[]).map((r) => [
      `${r.level_id}:${r.subject_id}`,
      r,
    ]),
  );

  const toUpsert: { school_id: string; level_id: string; subject_id: string; coefficient: number }[] = [];
  const toRemove: string[] = [];

  for (const cell of cells) {
    const key = `${cell.levelId}:${cell.subjectId}`;
    const row = existing.get(key);
    if (cell.coefficient === null) {
      if (row) toRemove.push(row.id);
      continue;
    }
    if (row && Number(row.coefficient) === cell.coefficient) continue;
    toUpsert.push({
      school_id: ctx.school.id,
      level_id: cell.levelId,
      subject_id: cell.subjectId,
      coefficient: cell.coefficient,
    });
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase.from('level_subjects').upsert(toUpsert, { onConflict: 'level_id,subject_id' });
    if (error) throw error;
  }
  if (toRemove.length > 0) {
    const { error } = await supabase.from('level_subjects').delete().eq('school_id', ctx.school.id).in('id', toRemove);
    if (error) throw error;
  }

  if (toUpsert.length > 0 || toRemove.length > 0) {
    await audit(ctx, {
      action: 'programme.matrix_save',
      module: 'programme',
      entityType: 'level_subject',
      after: { changed: toUpsert.length, removed: toRemove.length },
    });
  }
  return { changed: toUpsert.length, removed: toRemove.length };
}

/**
 * Enregistre le tableau croisé des SÉANCES.
 *
 * Même principe que celui des coefficients, mais il ne touche qu'au volume :
 * vider une case met la matière à zéro séance sans la retirer du programme —
 * une matière notée mais non enseignée (la Conduite) reste légitime. Le
 * coefficient n'est jamais écrasé.
 *
 * Une case ne peut porter de séances que si la matière est déjà au programme du
 * niveau : on ne l'y ajoute pas par un volume horaire.
 */
export async function saveSessionsMatrix(
  ctx: TenantContext,
  cells: { levelId: string; subjectId: string; sessions: number }[],
): Promise<{ changed: number }> {
  requireWritable(ctx, 'subjects.update');
  const supabase = await createClient();

  const { data: current } = await supabase
    .from('level_subjects')
    .select('id, level_id, subject_id, weekly_minutes')
    .eq('school_id', ctx.school.id);
  const existing = new Map(
    ((current ?? []) as { id: string; level_id: string; subject_id: string; weekly_minutes: number }[]).map((r) => [
      `${r.level_id}:${r.subject_id}`,
      r,
    ]),
  );

  // La durée d'une séance dépend du cycle : on la résout une fois par niveau.
  const slots = new Map<string, number>();
  for (const levelId of new Set(cells.map((c) => c.levelId))) {
    slots.set(levelId, await sessionMinutesForLevel(ctx, levelId));
  }

  let changed = 0;
  for (const cell of cells) {
    const row = existing.get(`${cell.levelId}:${cell.subjectId}`);
    if (!row) continue;
    const minutes = Math.max(0, Math.min(cell.sessions, 50)) * (slots.get(cell.levelId) ?? DEFAULT_SESSION_MINUTES);
    if (row.weekly_minutes === minutes) continue;
    const { error } = await supabase
      .from('level_subjects')
      .update({ weekly_minutes: minutes })
      .eq('school_id', ctx.school.id)
      .eq('id', row.id);
    if (error) throw error;
    changed += 1;
  }

  if (changed > 0) {
    await audit(ctx, {
      action: 'programme.sessions_save',
      module: 'programme',
      entityType: 'level_subject',
      after: { changed },
    });
  }
  return { changed };
}

/**
 * Remplit les séances manquantes depuis la grille officielle.
 *
 * Complément indispensable à `applyOfficialProgramme` : une école qui avait
 * chargé la grille AVANT que le document des horaires soit connu a des lignes
 * de programme correctes mais sans aucune séance. Le chargement, lui, ne
 * touche jamais une ligne existante — sinon il écraserait les ajustements de
 * l'école.
 *
 * Cette fonction ne remplit donc QUE les lignes à zéro séance. Un volume déjà
 * saisi, même différent du document, est laissé tel quel.
 */
export async function applyOfficialSessions(ctx: TenantContext): Promise<{ filled: number; skipped: number }> {
  requireWritable(ctx, 'subjects.update');
  const supabase = await createClient();
  const todo = await fillableSessions(ctx);
  for (const item of todo) {
    const { error } = await supabase
      .from('level_subjects')
      .update({ weekly_minutes: item.minutes })
      .eq('school_id', ctx.school.id)
      .eq('id', item.id);
    if (error) throw error;
  }
  if (todo.length > 0) {
    await audit(ctx, {
      action: 'programme.apply_official_sessions',
      module: 'programme',
      entityType: 'school',
      entityId: ctx.school.id,
      after: { filled: todo.length },
    });
  }
  return { filled: todo.length, skipped: 0 };
}

/** Combien de lignes la grille officielle pourrait remplir — pour n'afficher le bouton que s'il sert. */
export async function countFillableSessions(ctx: TenantContext): Promise<number> {
  return (await fillableSessions(ctx)).length;
}

/**
 * Les lignes de programme que la grille officielle peut remplir : celles qui
 * sont à zéro séance ALORS QUE le document en prévoit.
 *
 * La Conduite est volontairement exclue : elle se note sans s'enseigner, son
 * zéro est le bon compte. Sans cette exclusion, le bandeau « X matières sans
 * séance » ne disparaîtrait jamais.
 */
async function fillableSessions(ctx: TenantContext): Promise<{ id: string; minutes: number }[]> {
  const supabase = await createClient();
  const [{ data: levels }, { data: subjects }] = await Promise.all([
    supabase.from('levels').select('id, code').eq('school_id', ctx.school.id),
    supabase.from('subjects').select('id, code').eq('school_id', ctx.school.id),
  ]);
  const levelByCode = new Map(((levels ?? []) as { id: string; code: string }[]).map((l) => [l.code, l.id]));
  const subjectByCode = new Map(((subjects ?? []) as { id: string; code: string }[]).map((s) => [s.code, s.id]));

  const { data: rows } = await supabase
    .from('level_subjects')
    .select('id, level_id, subject_id')
    .eq('school_id', ctx.school.id)
    .eq('weekly_minutes', 0);
  const zeroed = new Map(
    ((rows ?? []) as { id: string; level_id: string; subject_id: string }[]).map((r) => [
      `${r.level_id}:${r.subject_id}`,
      r.id,
    ]),
  );
  if (zeroed.size === 0) return [];

  const slots = new Map<string, number>();
  const out: { id: string; minutes: number }[] = [];
  for (const [levelCode, entries] of Object.entries(OFFICIAL_CI_PROGRAMME)) {
    const levelId = levelByCode.get(levelCode);
    if (!levelId) continue;
    for (const [subjectCode, entry] of Object.entries(entries)) {
      if (entry.sessions === 0) continue; // zéro voulu : la Conduite, notamment
      const subjectId = subjectByCode.get(subjectCode);
      if (!subjectId) continue;
      const id = zeroed.get(`${levelId}:${subjectId}`);
      if (!id) continue;
      if (!slots.has(levelId)) slots.set(levelId, await sessionMinutesForLevel(ctx, levelId));
      out.push({ id, minutes: entry.sessions * (slots.get(levelId) ?? DEFAULT_SESSION_MINUTES) });
    }
  }
  return out;
}
