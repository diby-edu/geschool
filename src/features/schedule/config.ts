import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, ValidationError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database';
import type { ScheduleConfigInput } from './schemas';

export type TimeSlot = {
  id: string;
  day_of_week: number;
  position: number;
  starts_at: string; // HH:MM:SS
  ends_at: string;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function toTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

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

export type CycleOverview = { id: string; name: string; configId: string | null };

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
  return (cycles ?? []).map((c) => ({ id: c.id, name: c.name, configId: configByCycle.get(c.id) ?? null }));
}

export type DayHours = { day: number; start: string; end: string };

/**
 * Horaire REEL de chaque jour, reconstruit a partir de la grille de creneaux
 * deja generee (min/max des time_slots TEACHING de ce jour) — jamais stocke a
 * part, pour ne jamais avoir deux sources de verite sur « l'horaire du mercredi ».
 */
export async function getDayHours(ctx: TenantContext, configId: string): Promise<DayHours[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('time_slots')
    .select('day_of_week, starts_at, ends_at')
    .eq('school_id', ctx.school.id)
    .eq('schedule_configuration_id', configId)
    .eq('kind', 'TEACHING');

  const byDay = new Map<number, { start: string; end: string }>();
  for (const row of (data ?? []) as { day_of_week: number; starts_at: string; ends_at: string }[]) {
    const cur = byDay.get(row.day_of_week);
    if (!cur) {
      byDay.set(row.day_of_week, { start: row.starts_at, end: row.ends_at });
    } else {
      if (row.starts_at < cur.start) cur.start = row.starts_at;
      if (row.ends_at > cur.end) cur.end = row.ends_at;
    }
  }
  return Array.from(byDay.entries())
    .map(([day, h]) => ({ day, start: h.start.slice(0, 5), end: h.end.slice(0, 5) }))
    .sort((a, b) => a.day - b.day);
}

export type BreakHours = { start: string; end: string; label: string };

/**
 * Pauses REELLES de la grille, reconstruites depuis les time_slots BREAK/LUNCH
 * deja generes (meme logique que getDayHours) — une pause identique appliquee
 * a plusieurs jours n'apparait qu'une fois.
 */
export async function getBreaks(ctx: TenantContext, configId: string): Promise<BreakHours[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('time_slots')
    .select('starts_at, ends_at, label')
    .eq('school_id', ctx.school.id)
    .eq('schedule_configuration_id', configId)
    .neq('kind', 'TEACHING');

  const seen = new Map<string, BreakHours>();
  for (const row of (data ?? []) as { starts_at: string; ends_at: string; label: string | null }[]) {
    const key = `${row.starts_at}-${row.ends_at}`;
    if (!seen.has(key)) seen.set(key, { start: row.starts_at.slice(0, 5), end: row.ends_at.slice(0, 5), label: row.label ?? 'Pause' });
  }
  return Array.from(seen.values()).sort((a, b) => a.start.localeCompare(b.start));
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

type Range = { start: number; end: number };

/** Retire des intervalles de pause d'une plage [start, end) — les pauses hors plage sont ignorees. */
function subtractBreaks(start: number, end: number, breaks: Range[]): Range[] {
  const clipped = breaks
    .map((b) => ({ start: Math.max(b.start, start), end: Math.min(b.end, end) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const ranges: Range[] = [];
  let cursor = start;
  for (const b of clipped) {
    if (b.start > cursor) ranges.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < end) ranges.push({ start: cursor, end });
  return ranges;
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
        'Des seances existent deja : impossible de regenerer la grille. Supprimez les versions d\'abord.',
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

  // Generation des creneaux : CHAQUE jour utilise SON PROPRE debut/fin, et les
  // pauses configurees (recreation, dejeuner) decoupent la journee en
  // plusieurs plages TEACHING separees par des creneaux BREAK — jamais
  // proposes au solveur ni a la saisie manuelle (kind != 'TEACHING' filtre
  // partout ailleurs), ce qui les exclut naturellement de tout cours.
  const breakRanges = input.breaks.map((b) => ({ start: toMinutes(b.start), end: toMinutes(b.end), label: b.label }));
  const slots: TablesInsert<'time_slots'>[] = [];
  for (const day of input.workingDays) {
    const hours = input.dayHours.find((h) => h.day === day);
    if (!hours) continue; // deja rejete par le schema, garde-fou
    const dayStart = toMinutes(hours.start);
    const dayEnd = toMinutes(hours.end);

    // Une pause ne s'applique a un jour que si elle y tient ENTIEREMENT — un
    // mercredi ecourte qui coupe la recreation en deux ne doit pas produire
    // une variante "recreation plus courte" ce jour-la (getBreaks() la
    // confondrait avec une pause distincte) : ce jour-la, pas de recreation du
    // tout plutot qu'une recreation partielle.
    const dayBreaks = breakRanges.filter((b) => b.start >= dayStart && b.end <= dayEnd);

    type Seg = { start: number; end: number; kind: 'TEACHING' | 'BREAK'; label?: string };
    const segs: Seg[] = subtractBreaks(dayStart, dayEnd, dayBreaks).map((r) => ({ ...r, kind: 'TEACHING' as const }));
    for (const b of dayBreaks) segs.push({ start: b.start, end: b.end, kind: 'BREAK', label: b.label });
    segs.sort((a, b) => a.start - b.start);

    let position = 0;
    for (const seg of segs) {
      if (seg.kind === 'BREAK') {
        slots.push({
          school_id: ctx.school.id,
          academic_year_id: yearId,
          schedule_configuration_id: config.id,
          day_of_week: day,
          position,
          starts_at: toTime(seg.start),
          ends_at: toTime(seg.end),
          kind: 'BREAK',
          label: seg.label ?? null,
        });
        position++;
        continue;
      }
      for (let t = seg.start; t + input.slotMinutes <= seg.end; t += input.slotMinutes) {
        slots.push({
          school_id: ctx.school.id,
          academic_year_id: yearId,
          schedule_configuration_id: config.id,
          day_of_week: day,
          position,
          starts_at: toTime(t),
          ends_at: toTime(t + input.slotMinutes),
          kind: 'TEACHING',
        });
        position++;
      }
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
      throw new ConflictError('Des seances utilisent cette grille : impossible de la supprimer.');
    }
  }

  const { error } = await supabase.from('schedule_configurations').delete().eq('school_id', ctx.school.id).eq('id', configId);
  if (error) throw error;
  await audit(ctx, { action: 'schedule.config_delete', module: 'schedule', entityType: 'schedule_configuration', entityId: configId });
}
