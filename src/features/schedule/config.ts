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
 * Cree (ou remplace) la configuration horaire par defaut de l'annee et genere
 * la grille de creneaux. Remplacer suppose qu'aucun emploi du temps n'y
 * reference encore les creneaux ; on refuse si des seances existent deja.
 */
export async function saveConfig(ctx: TenantContext, input: ScheduleConfigInput): Promise<void> {
  requireWritable(ctx, 'schedule.manage_configuration');
  if (!ctx.academicYear) throw new ValidationError("Activez une annee scolaire d'abord.");
  const supabase = await createClient();
  const yearId = ctx.academicYear.id;

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

  const { data: config, error } = await supabase
    .from('schedule_configurations')
    .insert({
      school_id: ctx.school.id,
      academic_year_id: yearId,
      name: 'Grille par defaut',
      working_days: input.workingDays,
      day_starts_at: `${input.dayStart}:00`,
      day_ends_at: `${input.dayEnd}:00`,
      default_session_minutes: input.slotMinutes,
      slot_granularity_minutes: 5,
      is_default: true,
      status: 'ACTIVE',
    })
    .select('id')
    .single();
  if (error) throw error;

  // Generation des creneaux : pour chaque jour ouvre, du debut a la fin, par pas
  const start = toMinutes(input.dayStart);
  const end = toMinutes(input.dayEnd);
  const slots: TablesInsert<'time_slots'>[] = [];
  for (const day of input.workingDays) {
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
