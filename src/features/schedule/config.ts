import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
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

export async function getConfig(ctx: TenantContext, yearId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_configurations')
    .select('id, name, working_days, day_starts_at, day_ends_at, default_session_minutes')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('is_default', true)
    .maybeSingle();
  return data;
}

export type DayHours = { day: number; start: string; end: string };

/**
 * Horaire REEL de chaque jour, reconstruit a partir de la grille de creneaux
 * deja generee (min/max des time_slots de ce jour) — jamais stocke a part,
 * pour ne jamais avoir deux sources de verite sur « l'horaire du mercredi ».
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
 * Cree (ou remplace) la configuration horaire par defaut d'UNE annee (celle
 * consultee sur sa page de gestion, pas necessairement l'annee active — un
 * etablissement peut preparer les horaires de l'annee suivante pendant que la
 * courante tourne encore) et genere la grille de creneaux. Remplacer suppose
 * qu'aucun emploi du temps n'y reference encore les creneaux ; on refuse si
 * des seances existent deja.
 */
export async function saveConfig(ctx: TenantContext, yearId: string, input: ScheduleConfigInput): Promise<void> {
  requireWritable(ctx, 'schedule.manage_configuration');
  const supabase = await createClient();

  const existing = await getConfig(ctx, yearId);
  if (existing) {
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
    await supabase.from('schedule_configurations').delete().eq('id', existing.id);
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
      name: 'Grille par defaut',
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

  // Generation des creneaux : CHAQUE jour utilise SON PROPRE debut/fin — un
  // mercredi ecourte et un lundi complet cohabitent sans traitement
  // particulier (c'est ce que la grille a toujours permis, migration 0016).
  const slots: TablesInsert<'time_slots'>[] = [];
  for (const day of input.workingDays) {
    const hours = input.dayHours.find((h) => h.day === day);
    if (!hours) continue; // deja rejete par le schema, garde-fou
    const start = toMinutes(hours.start);
    const end = toMinutes(hours.end);
    let position = 0;
    for (let t = start; t + input.slotMinutes <= end; t += input.slotMinutes) {
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
  if (slots.length > 0) {
    const { error: slotError } = await supabase.from('time_slots').insert(slots);
    if (slotError) throw slotError;
  }

  await audit(ctx, { action: 'schedule.config', module: 'schedule', entityType: 'schedule_configuration', entityId: config.id, after: input });
}
