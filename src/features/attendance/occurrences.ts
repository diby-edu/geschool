import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type OccurrenceRow = {
  id: string;
  occurs_on: string;
  starts_at: string;
  ends_at: string;
  subject: string;
  klass: string;
  class_id: string | null;
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
      'id, occurs_on, starts_at, ends_at, ' +
        'schedule_sessions(subject_id, subjects(name), ' +
        'schedule_session_targets(class_id, classes(name)), ' +
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
    schedule_sessions: {
      subjects: { name: string } | null;
      schedule_session_targets: { class_id: string | null; classes: { name: string } | null }[];
      schedule_session_teachers: { teachers: { first_name: string; last_name: string } | null }[];
    } | null;
  }[]).map((o) => {
    const target = o.schedule_sessions?.schedule_session_targets?.[0] ?? null;
    const t = o.schedule_sessions?.schedule_session_teachers?.[0]?.teachers ?? null;
    return {
      id: o.id,
      occurs_on: o.occurs_on,
      starts_at: hm(o.starts_at),
      ends_at: hm(o.ends_at),
      subject: o.schedule_sessions?.subjects?.name ?? 'Cours',
      klass: target?.classes?.name ?? '—',
      class_id: target?.class_id ?? null,
      teacher: t ? `${t.last_name.toUpperCase()} ${t.first_name}` : null,
      register_id: null as string | null,
      register_status: null as string | null,
    };
  });

  if (classId) rows = rows.filter((r) => r.class_id === classId);

  // État des appels de ces occurrences.
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    const { data: regs } = await supabase
      .from('attendance_registers')
      .select('id, session_occurrence_id, status')
      .eq('school_id', ctx.school.id)
      .in('session_occurrence_id', ids);
    const byOcc = new Map((regs ?? []).map((r) => [r.session_occurrence_id, r]));
    rows = rows.map((r) => {
      const reg = byOcc.get(r.id);
      return reg ? { ...r, register_id: reg.id, register_status: reg.status } : r;
    });
  }

  return rows;
}

export type OccurrenceDetail = {
  id: string;
  class_id: string | null;
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
      'id, occurs_on, starts_at, ends_at, ' +
        'schedule_sessions(subjects(name), schedule_session_targets(class_id, classes(name)))',
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
    schedule_sessions: {
      subjects: { name: string } | null;
      schedule_session_targets: { class_id: string | null; classes: { name: string } | null }[];
    } | null;
  };
  const target = o.schedule_sessions?.schedule_session_targets?.[0] ?? null;
  return {
    id: o.id,
    class_id: target?.class_id ?? null,
    subject: o.schedule_sessions?.subjects?.name ?? 'Cours',
    klass: target?.classes?.name ?? '—',
    occurs_on: o.occurs_on,
    starts_at: hm(o.starts_at),
    ends_at: hm(o.ends_at),
  };
}
