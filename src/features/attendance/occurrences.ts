import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { audienceOf, TARGETS_SELECT, type SessionTarget } from './targets';

export type OccurrenceRow = {
  id: string;
  occurs_on: string;
  starts_at: string;
  ends_at: string;
  subject: string;
  klass: string;
  class_id: string | null;
  /** Toutes les classes du cours (un cours commun en réunit plusieurs). */
  class_ids: string[];
  teacher: string | null;
  register_id: string | null;
  register_status: string | null;
};

function hm(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Occurrences datées d'un jour donné, avec l'état de leur appel. */
export async function listOccurrences(ctx: TenantContext, date: string, classId?: string): Promise<OccurrenceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('session_occurrences')
    .select(
      // L'appel vient AVEC la séance : une seconde requête « in (480 identifiants) »
      // dépassait la taille d'adresse admise et la page attendait 10 s pour rien.
      'id, occurs_on, starts_at, ends_at, attendance_registers(id, status), ' +
        'schedule_sessions(subject_id, subjects(name), ' +
        `${TARGETS_SELECT}, ` +
        'schedule_session_teachers(teachers(first_name, last_name)))',
    )
    .eq('school_id', ctx.school.id)
    .eq('occurs_on', date)
    .eq('status', 'SCHEDULED')
    .order('starts_at');
  if (error) throw error;

  let rows = ((data ?? []) as unknown as {
    id: string;
    occurs_on: string;
    starts_at: string;
    ends_at: string;
    attendance_registers: { id: string; status: string } | null;
    schedule_sessions: {
      subjects: { name: string } | null;
      schedule_session_targets: SessionTarget[];
      schedule_session_teachers: { teachers: { first_name: string; last_name: string } | null }[];
    } | null;
  }[]).map((o) => {
    const audience = audienceOf(o.schedule_sessions?.schedule_session_targets);
    const t = o.schedule_sessions?.schedule_session_teachers?.[0]?.teachers ?? null;
    return {
      id: o.id,
      occurs_on: o.occurs_on,
      starts_at: hm(o.starts_at),
      ends_at: hm(o.ends_at),
      subject: o.schedule_sessions?.subjects?.name ?? 'Cours',
      klass: audience.label,
      class_id: audience.classIds[0] ?? null,
      class_ids: audience.classIds,
      teacher: t ? `${t.last_name.toUpperCase()} ${t.first_name}` : null,
      register_id: o.attendance_registers?.id ?? null,
      register_status: o.attendance_registers?.status ?? null,
    };
  });

  if (classId) rows = rows.filter((r) => r.class_ids.includes(classId));

  return rows;
}

export type OccurrenceDetail = {
  id: string;
  class_id: string | null;
  class_ids: string[];
  group_ids: string[];
  /** Instants complets du créneau (horaire de remplacement compris). */
  starts_iso: string;
  ends_iso: string;
  status: string;
  subject: string;
  klass: string;
  occurs_on: string;
  starts_at: string;
  ends_at: string;
};

export async function getOccurrence(ctx: TenantContext, id: string): Promise<OccurrenceDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('session_occurrences')
    .select(
      'id, occurs_on, starts_at, ends_at, override_starts_at, override_ends_at, status, ' +
        `schedule_sessions(subjects(name), ${TARGETS_SELECT})`,
    )
    .eq('school_id', ctx.school.id)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const o = data as unknown as {
    id: string;
    occurs_on: string;
    starts_at: string;
    ends_at: string;
    override_starts_at: string | null;
    override_ends_at: string | null;
    status: string;
    schedule_sessions: {
      subjects: { name: string } | null;
      schedule_session_targets: SessionTarget[];
    } | null;
  };
  const audience = audienceOf(o.schedule_sessions?.schedule_session_targets);
  const startsIso = o.override_starts_at ?? o.starts_at;
  const endsIso = o.override_ends_at ?? o.ends_at;
  return {
    id: o.id,
    class_id: audience.classIds[0] ?? null,
    class_ids: audience.classIds,
    group_ids: audience.groupIds,
    starts_iso: startsIso,
    ends_iso: endsIso,
    status: o.status,
    subject: o.schedule_sessions?.subjects?.name ?? 'Cours',
    klass: audience.label,
    occurs_on: o.occurs_on,
    starts_at: hm(startsIso),
    ends_at: hm(endsIso),
  };
}
