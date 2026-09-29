import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, ValidationError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database';
import type { ScheduleConfigInput } from './schemas';
import { buildDaySlots, readDayPlans, type DayPlan, type Pause } from './day-grid';

export type TimeSlot = {
  id: string;
  day_of_week: number;
  position: number;
  starts_at: string; // HH:MM:SS
  ends_at: string;
};

const CONFIG_COLUMNS = 'id, name, cycle_id, working_days, day_starts_at, day_ends_at, default_session_minutes';

/**
 * Grille horaire par defaut de l'annee (cycle_id NULL — le socle commun a
 * tout l'etablissement). Utilisee partout ou aucune classe/cycle precis n'est
 * connu (page de generation globale, resume de la page annee scolaire).
 */
export async function getConfig(ctx: TenantContext, yearId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_configurations')
    .select(CONFIG_COLUMNS)
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .is('cycle_id', null)
    .eq('is_default', true)
    .maybeSingle();
  return data;
}

/**
 * Grille propre a un cycle (primaire, college…), si l'etablissement en a
 * defini une — sinon la grille par defaut. C'est la resolution a utiliser
 * partout ou une classe precise est connue : chaque cycle peut avoir ses
 * propres horaires et ses propres pauses (recreation, dejeuner).
 */
export async function getConfigForCycle(ctx: TenantContext, yearId: string, cycleId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_configurations')
    .select(CONFIG_COLUMNS)
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('cycle_id', cycleId)
    .eq('is_default', true)
    .maybeSingle();
  if (data) return data;
  return getConfig(ctx, yearId);
}

/** Grille PROPRE a un cycle, sans repli sur la grille par defaut — pour la page qui gere l'exception elle-meme. */
export async function getOwnConfigForCycle(ctx: TenantContext, yearId: string, cycleId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_configurations')
    .select(CONFIG_COLUMNS)
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('cycle_id', cycleId)
    .eq('is_default', true)
    .maybeSingle();
  return data;
}

/** Cycle d'une classe (classes.level_id -> levels.cycle_id), pour resoudre sa grille. */
export async function getClassCycleId(ctx: TenantContext, classId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('classes')
    .select('levels(cycle_id)')
    .eq('school_id', ctx.school.id)
    .eq('id', classId)
    .maybeSingle();
  return (data as unknown as { levels: { cycle_id: string } | null } | null)?.levels?.cycle_id ?? null;
}

/** Grille resolue pour une classe precise : sa grille de cycle si elle existe, sinon la grille par defaut. */
export async function getConfigForClass(ctx: TenantContext, yearId: string, classId: string) {
  const cycleId = await getClassCycleId(ctx, classId);
  if (!cycleId) return getConfig(ctx, yearId);
  return getConfigForCycle(ctx, yearId, cycleId);
}

export type CycleOverview = {
  id: string;
  name: string;
  configId: string | null;
  /** Grille PROPRE au cycle, quand il en a une (pour l'afficher à côté de son nom). */
  grid: { dayHours: DayPlan[]; breaks: Pause[] } | null;
};

/**
 * Cycles de l'etablissement avec l'etat de leur grille (propre, ou grille par
 * defaut faute d'exception) — pour la liste de gestion sur la fiche annee.
 */
export async function listCyclesOverview(ctx: TenantContext, yearId: string): Promise<CycleOverview[]> {
  const supabase = await createClient();
  const [{ data: cycles }, { data: configs }] = await Promise.all([
    supabase.from('cycles').select('id, name').eq('school_id', ctx.school.id).eq('is_active', true).order('sequence'),
    supabase
      .from('schedule_configurations')
      .select('id, cycle_id')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('is_default', true)
      .not('cycle_id', 'is', null),
  ]);
  const configByCycle = new Map((configs ?? []).map((c) => [c.cycle_id as string, c.id]));
  return Promise.all(
    (cycles ?? []).map(async (c) => {
      const configId = configByCycle.get(c.id) ?? null;
      return { id: c.id, name: c.name, configId, grid: configId ? await readGrid(ctx, configId) : null };
    }),
  );
}

export type GridPause = { day: number; start: string; end: string; label: string; kind: string };

/** Pauses de la grille, jour par jour — pour les montrer dans l'emploi du temps. */
export async function listPauses(ctx: TenantContext, configId: string): Promise<GridPause[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('time_slots')
    .select('day_of_week, starts_at, ends_at, kind, label')
    .eq('school_id', ctx.school.id)
    .eq('schedule_configuration_id', configId)
    .neq('kind', 'TEACHING')
    .order('starts_at');
  return ((data ?? []) as { day_of_week: number; starts_at: string; ends_at: string; kind: string; label: string | null }[]).map((r) => ({
    day: r.day_of_week,
    start: r.starts_at.slice(0, 5),
    end: r.ends_at.slice(0, 5),
    kind: r.kind,
    label: r.label ?? (r.kind === 'LUNCH' ? 'Pause déjeuner' : 'Pause'),
  }));
}

export type DayHours = DayPlan;
export type BreakHours = Pause;

async function readGrid(ctx: TenantContext, configId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('time_slots')
    .select('day_of_week, starts_at, ends_at, kind, label')
    .eq('school_id', ctx.school.id)
    .eq('schedule_configuration_id', configId);
  return readDayPlans((data ?? []) as { day_of_week: number; starts_at: string; ends_at: string; kind: string; label: string | null }[]);
}

/**
 * Horaire REEL de chaque jour (matin, pause déjeuner, après-midi), relu dans la
 * grille de créneaux déjà générée — jamais stocké à part, pour ne jamais avoir deux
 * sources de vérité sur « l'horaire du mercredi ».
 */
export async function getDayHours(ctx: TenantContext, configId: string): Promise<DayHours[]> {
  return (await readGrid(ctx, configId)).dayHours;
}

/** Récréations de la grille (la pause déjeuner n'en fait pas partie : elle sépare matin et après-midi). */
export async function getBreaks(ctx: TenantContext, configId: string): Promise<BreakHours[]> {
  return (await readGrid(ctx, configId)).breaks;
}

export async function listSlots(ctx: TenantContext, configId: string): Promise<TimeSlot[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('time_slots')
    .select('id, day_of_week, position, starts_at, ends_at')
    .eq('school_id', ctx.school.id)
    .eq('schedule_configuration_id', configId)
    .eq('kind', 'TEACHING')
    .order('day_of_week')
    .order('position');
  return (data ?? []) as TimeSlot[];
}

/**
 * Cree (ou remplace) une configuration horaire de l'annee et genere sa grille
 * de creneaux. `cycleId` null = grille par defaut (tout l'etablissement) ;
 * renseigne = grille propre a ce cycle, qui prime sur la grille par defaut
 * pour ses classes (getConfigForClass). Remplacer suppose qu'aucun emploi du
 * temps n'y reference encore les creneaux ; on refuse si des seances existent
 * deja.
 */
export async function saveConfig(
  ctx: TenantContext,
  yearId: string,
  input: ScheduleConfigInput,
  cycleId: string | null = null,
): Promise<void> {
  requireWritable(ctx, 'schedule.manage_configuration');
  const supabase = await createClient();

  const existing = cycleId ? await getConfigForCycle(ctx, yearId, cycleId) : await getConfig(ctx, yearId);
  const existingIsOwn = existing && existing.cycle_id === cycleId;
  if (existingIsOwn) {
    const { count } = await supabase
      .from('schedule_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId);
    if ((count ?? 0) > 0) {
      throw new ValidationError(
        'Des séances existent déjà : impossible de régénérer la grille. Supprimez les versions d\'abord.',
      );
    }
    await supabase.from('schedule_configurations').delete().eq('id', existing!.id);
  }

  // day_starts_at/day_ends_at ne pilotent plus la generation (chaque jour a
  // desormais son propre horaire, cf. input.dayHours) : ils ne servent plus
  // qu'a resumer la plage globale de l'etablissement (le plus tot, le plus
  // tard), pour l'affichage et les colonnes NOT NULL existantes.
  const globalStart = input.dayHours.reduce((min, h) => (h.start < min ? h.start : min), input.dayHours[0]!.start);
  const globalEnd = input.dayHours.reduce((max, h) => (h.end > max ? h.end : max), input.dayHours[0]!.end);

  const { data: config, error } = await supabase
    .from('schedule_configurations')
    .insert({
      school_id: ctx.school.id,
      academic_year_id: yearId,
      cycle_id: cycleId,
      name: cycleId ? 'Grille de cycle' : 'Grille par defaut',
      working_days: input.workingDays,
      day_starts_at: `${globalStart}:00`,
      day_ends_at: `${globalEnd}:00`,
      default_session_minutes: input.slotMinutes,
      slot_granularity_minutes: 5,
      is_default: true,
      status: 'ACTIVE',
    })
    .select('id')
    .single();
  if (error) throw error;

  // Génération des créneaux : chaque jour selon SON horaire (matin, après-midi),
  // découpé par la pause déjeuner et les récréations. Pauses = créneaux BREAK /
  // LUNCH, jamais proposés au solveur ni à la saisie (kind != 'TEACHING' filtré
  // partout ailleurs) : aucun cours n'y est jamais placé.
  const slots: TablesInsert<'time_slots'>[] = [];
  for (const day of input.workingDays) {
    const hours = input.dayHours.find((h) => h.day === day);
    if (!hours) continue; // déjà rejeté par le schéma, garde-fou
    for (const slot of buildDaySlots(hours, input.breaks, input.slotMinutes)) {
      slots.push({
        school_id: ctx.school.id,
        academic_year_id: yearId,
        schedule_configuration_id: config.id,
        day_of_week: day,
        position: slot.position,
        starts_at: `${slot.start}:00`,
        ends_at: `${slot.end}:00`,
        kind: slot.kind,
        label: slot.label,
      });
    }
  }
  if (slots.length > 0) {
    const { error: slotError } = await supabase.from('time_slots').insert(slots);
    if (slotError) throw slotError;
  }

  await audit(ctx, {
    action: 'schedule.config',
    module: 'schedule',
    entityType: 'schedule_configuration',
    entityId: config.id,
    after: { ...input, cycleId },
  });
}

/** Supprime la grille propre d'un cycle : ses classes retombent sur la grille par defaut. */
export async function deleteConfig(ctx: TenantContext, configId: string): Promise<void> {
  requireWritable(ctx, 'schedule.manage_configuration');
  const supabase = await createClient();

  const { data: slotRows } = await supabase.from('time_slots').select('id').eq('schedule_configuration_id', configId);
  const slotIds = (slotRows ?? []).map((s) => s.id);
  if (slotIds.length > 0) {
    const { count } = await supabase
      .from('schedule_sessions')
      .select('id', { count: 'exact', head: true })
      .or(`start_slot_id.in.(${slotIds.join(',')}),end_slot_id.in.(${slotIds.join(',')})`);
    if ((count ?? 0) > 0) {
      throw new ConflictError('Des séances utilisent cette grille : impossible de la supprimer.');
    }
  }

  const { error } = await supabase.from('schedule_configurations').delete().eq('school_id', ctx.school.id).eq('id', configId);
  if (error) throw error;
  await audit(ctx, { action: 'schedule.config_delete', module: 'schedule', entityType: 'schedule_configuration', entityId: configId });
}
