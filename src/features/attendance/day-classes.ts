import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';
import type { TenantContext } from '@/lib/tenant/context';
import { clock } from './day-phase';

export type DayCourseState = 'done' | 'missed' | 'now' | 'later';

export type DayCourse = {
  id: string;
  /** Heures affichées dans le fuseau de l'établissement : « 08:25 ». */
  start: string;
  end: string;
  /** Créneaux occupés : 2 pour un bloc de 2 h (un seul cours, un seul appel). */
  hours: number;
  subject: string;
  teacher: string | null;
  state: DayCourseState;
  /** Terminé à l'heure de la lecture (appel fait ou non). */
  ended: boolean;
};

export type DayClass = {
  id: string;
  name: string;
  levelId: string | null;
  levelName: string | null;
  absent: number;
  excused: number;
  late: number;
  courses: DayCourse[];
};

/**
 * La journée de chaque classe (0162, maquette validée le 2026-10-30) : ses cours
 * dans l'ordre avec l'état de l'appel, et ses élèves absents ou en retard.
 * `null` : fonction absente (migration non appliquée) ou droit insuffisant —
 * la page reprend alors l'ancienne liste.
 */
export async function loadDayByClass(ctx: TenantContext, day: string, now: Date): Promise<DayClass[] | null> {
  const supabase = await createClient();
  const res = await callRpc<{
    classes: {
      class_id: string;
      name: string;
      level_id: string | null;
      level_name: string | null;
      level_seq: number;
      absent: number;
      excused: number;
      late: number;
      courses: { id: string; starts_at: string; ends_at: string; hours: number; subject: string; teacher: string | null; state: DayCourseState }[];
    }[];
  }>(supabase, 'attendance_day_by_class', { p_school: ctx.school.id, p_day: day, p_now: now.toISOString() });
  if (!res.data) return null;
  const tz = ctx.school.timezone;
  const nowMs = now.getTime();
  // Ordre de l'école : par niveau, puis « 6ème 2 » avant « 6ème 10 » (la base trie le texte).
  const ordered = [...res.data.classes].sort((a, b) => a.level_seq - b.level_seq || a.name.localeCompare(b.name, 'fr', { numeric: true }));
  return ordered.map((c) => ({
    id: c.class_id,
    name: c.name,
    levelId: c.level_id,
    levelName: c.level_name,
    absent: c.absent,
    excused: c.excused,
    late: c.late,
    courses: c.courses.map((k) => ({
      id: k.id,
      start: clock(k.starts_at, tz),
      end: clock(k.ends_at, tz),
      hours: Math.max(1, k.hours),
      subject: k.subject,
      teacher: k.teacher,
      state: k.state,
      ended: new Date(k.ends_at).getTime() <= nowMs,
    })),
  }));
}
