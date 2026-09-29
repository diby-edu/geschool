import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { listAllRoomRules } from './weekly-availability';

/**
 * Occupation des salles, d'après l'emploi du temps PUBLIÉ de l'année en cours.
 *
 * Deux questions, une seule source : « que se passe-t-il dans la salle B12
 * cette semaine ? » et « quelles salles sont libres mardi à 10 h ? ».
 */

export type RoomSlot = {
  sessionId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  subject: string;
  classes: string[];
};

export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

type Raw = {
  id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  subjects: { name: string } | null;
  schedule_session_targets: { classes: { name: string } | null }[];
  schedule_session_rooms: { room_id: string }[];
};

async function publishedVersionId(ctx: TenantContext): Promise<string | null> {
  const yearId = ctx.academicYear?.id;
  if (!yearId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_versions')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'PUBLISHED')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function loadSessions(ctx: TenantContext): Promise<Raw[]> {
  const versionId = await publishedVersionId(ctx);
  if (!versionId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_sessions')
    .select(
      'id, day_of_week, starts_at, ends_at, subjects(name), ' +
        'schedule_session_targets(classes(name)), schedule_session_rooms(room_id)',
    )
    .eq('school_id', ctx.school.id)
    .eq('schedule_version_id', versionId)
    .order('day_of_week')
    .order('starts_at');
  return (data ?? []) as unknown as Raw[];
}

const toSlot = (s: Raw): RoomSlot => ({
  sessionId: s.id,
  dayOfWeek: s.day_of_week,
  startsAt: s.starts_at.slice(0, 5),
  endsAt: s.ends_at.slice(0, 5),
  subject: s.subjects?.name ?? 'Cours',
  classes: s.schedule_session_targets.map((t) => t.classes?.name).filter((n): n is string => !!n),
});

/** La semaine type d'une salle : ce qui s'y passe, jour par jour. */
export async function roomWeek(ctx: TenantContext, roomId: string): Promise<RoomSlot[]> {
  const sessions = await loadSessions(ctx);
  return sessions.filter((s) => s.schedule_session_rooms.some((r) => r.room_id === roomId)).map(toSlot);
}

export type FreeRoom = { id: string; code: string; name: string; capacity: number; busyWith: string | null };

/**
 * Quelles salles sont libres un jour donné, à une heure donnée ? Les salles
 * occupées sont renvoyées aussi, avec ce qui les occupe : savoir POURQUOI une
 * salle n'est pas libre vaut mieux que de la voir disparaître de la liste.
 */
export async function roomsAt(ctx: TenantContext, dayOfWeek: number, hm: string): Promise<FreeRoom[]> {
  const supabase = await createClient();
  const [{ data: rooms }, sessions, rules] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, code, name, capacity')
      .eq('school_id', ctx.school.id)
      .eq('is_active', true)
      .order('code'),
    loadSessions(ctx),
    listAllRoomRules(ctx),
  ]);

  const minutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const at = minutes(hm);
  const busy = new Map<string, string>();
  for (const s of sessions) {
    if (s.day_of_week !== dayOfWeek) continue;
    if (minutes(s.starts_at) > at || at >= minutes(s.ends_at)) continue;
    const slot = toSlot(s);
    for (const r of s.schedule_session_rooms) {
      busy.set(r.room_id, `${slot.subject}${slot.classes.length > 0 ? ` · ${slot.classes.join(', ')}` : ''}`);
    }
  }

  // Une indisponibilité hebdomadaire vaut occupation : la salle existe, mais
  // elle n'est pas disponible à cette heure-là.
  for (const rule of rules) {
    if (rule.dayOfWeek !== dayOfWeek) continue;
    if (minutes(rule.startsAt) > at || at >= minutes(rule.endsAt)) continue;
    busy.set(rule.roomId, rule.reason ? `Indisponible · ${rule.reason}` : 'Indisponible chaque semaine');
  }

  return ((rooms ?? []) as { id: string; code: string; name: string; capacity: number }[]).map((r) => ({
    ...r,
    busyWith: busy.get(r.id) ?? null,
  }));
}
