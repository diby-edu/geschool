import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { conflictsFor, type ValidatorSession } from '@/lib/schedule/validator';
import { fetchAllRows } from '@/lib/supabase/pagination';
import type { SessionInput } from './schemas';

// Page reduite (au lieu du plafond PostgREST de 1000) : la policy RLS de
// schedule_sessions (app.can_see_session) est couteuse par ligne — mesure,
// une page de 1000 lignes avec ses relations imbriquees peut depasser le
// statement_timeout Postgres a elle seule (cf. lib/supabase/pagination).
const SCHEDULE_SESSIONS_PAGE_SIZE = 200;

export type SessionRow = {
  id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  is_locked: boolean;
  subject_name: string;
  teacher_name: string | null;
  class_name: string | null;
  class_id: string | null;
  room_name: string | null;
};

/**
 * Charge les seances d'une version sous la forme attendue par le validateur.
 * Une meme seance peut avoir plusieurs enseignants / cibles / salles ; on les
 * agrege par seance.
 */
export async function loadValidatorSessions(ctx: TenantContext, versionId: string): Promise<ValidatorSession[]> {
  const supabase = await createClient();
  const data = await fetchAllRows((from, to) =>
    supabase
      .from('schedule_sessions')
      .select(
        'id, day_of_week, starts_at, ends_at, subjects(name), ' +
          'schedule_session_teachers(teacher_id), schedule_session_targets(class_id, group_id), schedule_session_rooms(room_id)',
      )
      .eq('school_id', ctx.school.id)
      .eq('schedule_version_id', versionId)
      .order('id') // tri stable requis : la pagination par pages depend d'un ordre deterministe
      .range(from, to),
    SCHEDULE_SESSIONS_PAGE_SIZE,
  );

  return (data as unknown as {
    id: string;
    day_of_week: number;
    starts_at: string;
    ends_at: string;
    subjects: { name: string } | null;
    schedule_session_teachers: { teacher_id: string }[];
    schedule_session_targets: { class_id: string | null; group_id: string | null }[];
    schedule_session_rooms: { room_id: string }[];
  }[]).map((s) => ({
    id: s.id,
    label: s.subjects?.name ?? 'Cours',
    dayOfWeek: s.day_of_week,
    startMin: hmToMin(s.starts_at),
    endMin: hmToMin(s.ends_at),
    teacherIds: s.schedule_session_teachers.map((t) => t.teacher_id),
    classIds: s.schedule_session_targets.map((t) => t.class_id).filter((x): x is string => !!x),
    groupIds: s.schedule_session_targets.map((t) => t.group_id).filter((x): x is string => !!x),
    roomIds: s.schedule_session_rooms.map((r) => r.room_id),
  }));
}

function hmToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export async function listSessions(ctx: TenantContext, versionId: string): Promise<SessionRow[]> {
  const supabase = await createClient();
  const data = await fetchAllRows((from, to) =>
    supabase
      .from('schedule_sessions')
      .select(
        'id, day_of_week, starts_at, ends_at, duration_minutes, is_locked, subjects(name), ' +
          'schedule_session_teachers(teachers(first_name, last_name)), ' +
          'schedule_session_targets(class_id, classes(name)), ' +
          'schedule_session_rooms(rooms(code))',
      )
      .eq('school_id', ctx.school.id)
      .eq('schedule_version_id', versionId)
      .order('day_of_week')
      .order('starts_at')
      .order('id') // tri stable requis : la pagination par pages depend d'un ordre deterministe
      .range(from, to),
    SCHEDULE_SESSIONS_PAGE_SIZE,
  );

  return (data as unknown as {
    id: string;
    day_of_week: number;
    starts_at: string;
    ends_at: string;
    duration_minutes: number;
    is_locked: boolean;
    subjects: { name: string } | null;
    schedule_session_teachers: { teachers: { first_name: string; last_name: string } | null }[];
    schedule_session_targets: { class_id: string | null; classes: { name: string } | null }[];
    schedule_session_rooms: { rooms: { code: string } | null }[];
  }[]).map((s) => {
    const t = s.schedule_session_teachers[0]?.teachers ?? null;
    const target = s.schedule_session_targets[0] ?? null;
    return {
      id: s.id,
      day_of_week: s.day_of_week,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      duration_minutes: s.duration_minutes,
      is_locked: s.is_locked,
      subject_name: s.subjects?.name ?? 'Cours',
      teacher_name: t ? `${t.last_name.toUpperCase()} ${t.first_name}` : null,
      class_name: target?.classes?.name ?? null,
      class_id: target?.class_id ?? null,
      room_name: s.schedule_session_rooms[0]?.rooms?.code ?? null,
    };
  });
}

export async function addSession(ctx: TenantContext, versionId: string, input: SessionInput): Promise<void> {
  requireWritable(ctx, 'schedule.create');
  const supabase = await createClient();

  const version = await supabase
    .from('schedule_versions')
    .select('id, status, academic_year_id')
    .eq('school_id', ctx.school.id)
    .eq('id', versionId)
    .maybeSingle();
  if (!version.data) throw new NotFoundError('Version introuvable.');
  if (version.data.status === 'PUBLISHED' || version.data.status === 'ARCHIVED') {
    throw new ValidationError('Cette version n\'est plus modifiable.');
  }

  // Creneaux -> horaires
  const { data: slots } = await supabase
    .from('time_slots')
    .select('id, day_of_week, starts_at, ends_at')
    .eq('school_id', ctx.school.id)
    .in('id', [input.startSlotId, input.endSlotId]);
  const startSlot = slots?.find((s) => s.id === input.startSlotId);
  const endSlot = slots?.find((s) => s.id === input.endSlotId);
  if (!startSlot || !endSlot) throw new ValidationError('Creneaux invalides.');
  if (startSlot.day_of_week !== endSlot.day_of_week) {
    throw new ValidationError('Les deux creneaux doivent etre le meme jour.');
  }
  const dayOfWeek = startSlot.day_of_week;
  const startsAt = startSlot.starts_at;
  const endsAt = endSlot.ends_at;
  const duration = hmToMin(endsAt) - hmToMin(startsAt);
  if (duration <= 0) throw new ValidationError('Le creneau de fin doit suivre celui de debut.');

  // Validation independante AVANT insertion
  const candidate: ValidatorSession = {
    id: 'candidate',
    label: 'Nouveau cours',
    dayOfWeek,
    startMin: hmToMin(startsAt),
    endMin: hmToMin(endsAt),
    teacherIds: input.teacherId ? [input.teacherId] : [],
    classIds: [input.classId],
    groupIds: [],
    roomIds: input.roomId ? [input.roomId] : [],
  };
  const existing = await loadValidatorSessions(ctx, versionId);
  const conflicts = conflictsFor(candidate, existing);
  if (conflicts.length > 0) {
    throw new ConflictError(conflicts[0]!.message);
  }

  // Insertion
  const { data: session, error } = await supabase
    .from('schedule_sessions')
    .insert({
      school_id: ctx.school.id,
      academic_year_id: version.data.academic_year_id,
      schedule_version_id: versionId,
      subject_id: input.subjectId,
      day_of_week: dayOfWeek,
      start_slot_id: input.startSlotId,
      end_slot_id: input.endSlotId,
      starts_at: startsAt,
      ends_at: endsAt,
      duration_minutes: duration,
      status: 'PLANNED',
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('schedule_session_targets').insert({
    school_id: ctx.school.id, session_id: session.id, target_type: 'CLASS', class_id: input.classId,
  });
  if (input.teacherId) {
    await supabase.from('schedule_session_teachers').insert({
      school_id: ctx.school.id, session_id: session.id, teacher_id: input.teacherId, role: 'LEAD',
    });
  }
  if (input.roomId) {
    await supabase.from('schedule_session_rooms').insert({
      school_id: ctx.school.id, session_id: session.id, room_id: input.roomId, is_primary: true,
    });
  }

  await audit(ctx, { action: 'schedule.session_add', module: 'schedule', entityType: 'schedule_session', entityId: session.id });
}

export async function deleteSession(ctx: TenantContext, sessionId: string): Promise<void> {
  requireWritable(ctx, 'schedule.delete');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('schedule_sessions')
    .delete({ count: 'exact' })
    .eq('school_id', ctx.school.id)
    .eq('id', sessionId);
  if (error) throw error;
  if (!count) throw new NotFoundError('Seance introuvable.');
  await audit(ctx, { action: 'schedule.session_delete', module: 'schedule', entityType: 'schedule_session', entityId: sessionId });
}
