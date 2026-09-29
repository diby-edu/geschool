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
type ValidatorSessionRaw = {
  id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  subjects: { name: string } | null;
  schedule_session_teachers: { teacher_id: string }[];
  schedule_session_targets: { class_id: string | null; group_id: string | null }[];
  schedule_session_rooms: { room_id: string }[];
};

/**
 * Tout ce dont l'ecran a besoin, en une seule lecture.
 *
 * L'editeur affiche la grille ET signale les conflits : il demandait donc deux
 * fois les memes seances, avec deux paginations completes. A l'echelle d'un
 * lycee (2 000 seances, policy RLS couteuse par ligne) cela doublait le temps
 * de la page — parfois jusqu'au statement_timeout. Un seul select suffit : les
 * identifiants bruts et les libelles lisibles voyagent ensemble.
 */
type FullSessionRaw = {
  id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  is_locked: boolean;
  subjects: { name: string } | null;
  schedule_session_teachers: { teacher_id: string; teachers: { first_name: string; last_name: string } | null }[];
  schedule_session_targets: { class_id: string | null; group_id: string | null; classes: { name: string } | null }[];
  schedule_session_rooms: { room_id: string; rooms: { code: string } | null }[];
};

const FULL_SESSION_SELECT =
  'id, day_of_week, starts_at, ends_at, duration_minutes, is_locked, subjects(name), ' +
  'schedule_session_teachers(teacher_id, teachers(first_name, last_name)), ' +
  'schedule_session_targets(class_id, group_id, classes(name)), ' +
  'schedule_session_rooms(room_id, rooms(code))';

/** La grille a afficher et la liste que verifie le validateur, d'une seule lecture. */
export async function listSessionsWithValidator(
  ctx: TenantContext,
  versionId: string,
): Promise<{ rows: SessionRow[]; validator: ValidatorSession[] }> {
  const supabase = await createClient();
  const data = await fetchAllRows<FullSessionRaw>((cursor) => {
    let q = supabase
      .from('schedule_sessions')
      .select(FULL_SESSION_SELECT)
      .eq('school_id', ctx.school.id)
      .eq('schedule_version_id', versionId)
      .order('id')
      .limit(SCHEDULE_SESSIONS_PAGE_SIZE);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: FullSessionRaw[] | null; error: { message: string } | null }>;
  }, SCHEDULE_SESSIONS_PAGE_SIZE);

  const rows = data.map(toSessionRow);
  rows.sort((a, b) => a.day_of_week - b.day_of_week || a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id));

  const validator: ValidatorSession[] = data.map((s) => ({
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

  return { rows, validator };
}

/** Une ligne brute vers la ligne affichable. */
function toSessionRow(s: {
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
}): SessionRow {
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
}

export async function loadValidatorSessions(ctx: TenantContext, versionId: string): Promise<ValidatorSession[]> {
  const supabase = await createClient();
  const data = await fetchAllRows<ValidatorSessionRaw>((cursor) => {
    let q = supabase
      .from('schedule_sessions')
      .select(
        'id, day_of_week, starts_at, ends_at, subjects(name), ' +
          'schedule_session_teachers(teacher_id), schedule_session_targets(class_id, group_id), schedule_session_rooms(room_id)',
      )
      .eq('school_id', ctx.school.id)
      .eq('schedule_version_id', versionId)
      .order('id') // curseur : tri total requis (cf. lib/supabase/pagination)
      .limit(SCHEDULE_SESSIONS_PAGE_SIZE);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: ValidatorSessionRaw[] | null; error: { message: string } | null }>;
  }, SCHEDULE_SESSIONS_PAGE_SIZE);

  return data.map((s) => ({
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

type SessionRowRaw = {
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
};

export async function listSessions(ctx: TenantContext, versionId: string): Promise<SessionRow[]> {
  const supabase = await createClient();
  // Curseur uniquement par id (cf. lib/supabase/pagination) : l'ordre
  // d'affichage voulu (jour, heure) est applique cote client une fois la
  // lecture complete, plutot qu'en tri compose cote base.
  const data = await fetchAllRows<SessionRowRaw>((cursor) => {
    let q = supabase
      .from('schedule_sessions')
      .select(
        'id, day_of_week, starts_at, ends_at, duration_minutes, is_locked, subjects(name), ' +
          'schedule_session_teachers(teachers(first_name, last_name)), ' +
          'schedule_session_targets(class_id, classes(name)), ' +
          'schedule_session_rooms(rooms(code))',
      )
      .eq('school_id', ctx.school.id)
      .eq('schedule_version_id', versionId)
      .order('id')
      .limit(SCHEDULE_SESSIONS_PAGE_SIZE);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: SessionRowRaw[] | null; error: { message: string } | null }>;
  }, SCHEDULE_SESSIONS_PAGE_SIZE);
  data.sort((a, b) => a.day_of_week - b.day_of_week || a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id));

  return data.map(toSessionRow);
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
  if (!startSlot || !endSlot) throw new ValidationError('Créneaux invalides.');
  if (startSlot.day_of_week !== endSlot.day_of_week) {
    throw new ValidationError('Les deux créneaux doivent être le même jour.');
  }
  const dayOfWeek = startSlot.day_of_week;
  const startsAt = startSlot.starts_at;
  const endsAt = endSlot.ends_at;
  const duration = hmToMin(endsAt) - hmToMin(startsAt);
  if (duration <= 0) throw new ValidationError('Le créneau de fin doit suivre celui de début.');

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
  if (!count) throw new NotFoundError('Séance introuvable.');
  await audit(ctx, { action: 'schedule.session_delete', module: 'schedule', entityType: 'schedule_session', entityId: sessionId });
}
