import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, ValidationError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database';
import { detectConflicts, type ValidatorSession } from '@/lib/schedule/validator';
import { getConfig } from './config';
import { loadValidatorSessions } from './sessions';
import { getSolver, SolverError, type ScheduleInput, type ScheduleSolution, type SolverTask } from './solver';

// ---------------------------------------------------------------------------
// Types de resultat, exposes a l'UI
// ---------------------------------------------------------------------------

export type GenerationResult = {
  jobId: string;
  status: 'SUCCEEDED' | 'INFEASIBLE' | 'FAILED';
  solverStatus?: string;
  versionId?: string;
  taskCount: number;
  assignedCount: number;
  /** Diagnostics DEJA traduits (noms reels), surs a afficher (docs/SOLVER_API.md §6). */
  diagnostics: string[];
  message?: string;
};

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function hmToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

type Slot = { id: string; day_of_week: number; position: number; starts_at: string; ends_at: string };

type Window = { day: number; start: number; end: number };

/**
 * Un enseignant est libre sur un creneau si aucune indisponibilite ne le couvre,
 * et — s'il declare des plages AVAILABLE — si le creneau tombe dans l'une d'elles.
 * PREFERRED/AVOID sont des preferences douces, ignorees a ce stade (v1.0.0).
 */
function teacherFreeAt(
  available: Window[],
  unavailable: Window[],
  hasAvailable: boolean,
  day: number,
  start: number,
  end: number,
): boolean {
  for (const w of unavailable) {
    if (w.day === day && start < w.end && w.start < end) return false;
  }
  if (!hasAvailable) return true;
  return available.some((w) => w.day === day && start >= w.start && end <= w.end);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Genere un emploi du temps depuis les exigences pedagogiques (lot 7).
 *
 * Deroulement : construction du probleme en INDICES → verification arithmetique
 * rapide (aucun temps solveur gaspille, ADR-014) → resolution CP-SAT → si une
 * solution existe, creation d'une version BROUILLON et de ses seances, puis
 * post-validation par le validateur INDEPENDANT (docs/SCHEDULE_ENGINE.md §9).
 * Une generation ne touche JAMAIS la version publiee (additif §61).
 */
export async function generateSchedule(ctx: TenantContext, yearId: string): Promise<GenerationResult> {
  requireWritable(ctx, 'schedule.generate');
  const supabase = await createClient();

  const config = await getConfig(ctx, yearId);
  if (!config) throw new ValidationError('Configurez d\'abord la grille horaire.');
  const slotMinutes = config.default_session_minutes;

  // --- grille aplatie ---
  const { data: rawSlots } = await supabase
    .from('time_slots')
    .select('id, day_of_week, position, starts_at, ends_at')
    .eq('school_id', ctx.school.id)
    .eq('schedule_configuration_id', config.id)
    .eq('kind', 'TEACHING')
    .order('day_of_week')
    .order('position');
  const slots = (rawSlots ?? []) as Slot[];
  if (slots.length === 0) throw new ValidationError('La grille horaire ne contient aucun creneau.');

  const slotIndexById = new Map<string, number>();
  slots.forEach((s, i) => slotIndexById.set(s.id, i));
  // Indices globaux groupes par jour, dans l'ordre des positions.
  const dayToIndexes = new Map<number, number[]>();
  slots.forEach((s, i) => {
    const list = dayToIndexes.get(s.day_of_week) ?? [];
    list.push(i);
    dayToIndexes.set(s.day_of_week, list);
  });

  // --- exigences a placer ---
  const { data: reqs } = await supabase
    .from('teaching_requirements')
    .select(
      'id, subject_id, weekly_minutes, sessions_count, session_duration_minutes, ' +
        'room_requirement_mode, required_room_id, required_room_type_id, preferred_room_id, min_capacity, ' +
        'subjects(name), ' +
        'teaching_requirement_targets(target_type, class_id, group_id, classes(name), groups(name)), ' +
        'teaching_requirement_teachers(teacher_id, teachers(first_name, last_name))',
    )
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('status', 'ACTIVE');
  const requirements = (reqs ?? []) as unknown as ReqRow[];
  if (requirements.length === 0) {
    throw new ValidationError('Aucune exigence pedagogique active. Synchronisez-les depuis les affectations.');
  }

  // --- espaces d'index compacts ---
  const teacherIx = new Indexer();
  const classIx = new Indexer();
  const groupIx = new Indexer();
  const roomIx = new Indexer();

  // --- disponibilites enseignants ---
  const { data: avail } = await supabase
    .from('teacher_availability')
    .select('teacher_id, day_of_week, starts_at, ends_at, kind')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId);
  const availByTeacher = new Map<string, { avail: Window[]; unavail: Window[] }>();
  for (const a of avail ?? []) {
    const e = availByTeacher.get(a.teacher_id) ?? { avail: [], unavail: [] };
    const w: Window = { day: a.day_of_week, start: hmToMin(a.starts_at), end: hmToMin(a.ends_at) };
    if (a.kind === 'AVAILABLE') e.avail.push(w);
    else if (a.kind === 'UNAVAILABLE') e.unavail.push(w);
    availByTeacher.set(a.teacher_id, e);
  }

  // --- salles actives (pour resoudre les candidats par mode) ---
  const { data: roomRows } = await supabase
    .from('rooms')
    .select('id, room_type_id, capacity, is_active')
    .eq('school_id', ctx.school.id)
    .eq('is_active', true);
  const rooms = (roomRows ?? []) as { id: string; room_type_id: string | null; capacity: number; is_active: boolean }[];

  // --- appartenance groupe -> classes (§16) ---
  const { data: gcRows } = await supabase
    .from('group_classes')
    .select('group_id, class_id')
    .eq('school_id', ctx.school.id);
  const groupToClasses = new Map<string, string[]>();
  for (const gc of gcRows ?? []) {
    const list = groupToClasses.get(gc.group_id) ?? [];
    list.push(gc.class_id);
    groupToClasses.set(gc.group_id, list);
  }

  // --- construction des taches ---
  const tasks: SolverTask[] = [];
  const taskMeta: TaskMeta[] = [];
  const problems: string[] = [];

  for (const r of requirements) {
    const label = `${r.subjects?.name ?? 'Cours'} — ${targetLabel(r)}`;
    const durMin = r.session_duration_minutes ?? Math.round(r.weekly_minutes / Math.max(1, r.sessions_count));
    const durationSlots = Math.max(1, Math.round(durMin / slotMinutes));

    const teacherIds = r.teaching_requirement_teachers.map((t) => t.teacher_id);
    const classIds = r.teaching_requirement_targets.filter((t) => t.target_type === 'CLASS' && t.class_id).map((t) => t.class_id!);
    const groupIds = r.teaching_requirement_targets.filter((t) => t.target_type === 'GROUP' && t.group_id).map((t) => t.group_id!);

    // candidats salle selon le mode
    const roomResult = resolveRooms(r, rooms);
    if (roomResult.error) {
      problems.push(`« ${label} » : ${roomResult.error}`);
      continue;
    }

    // creneaux de depart candidats : tenue dans la journee + disponibilite de
    // TOUS les enseignants de la seance sur toute la duree.
    const candidateStartSlots: number[] = [];
    for (const [, dayIndexes] of dayToIndexes) {
      for (let k = 0; k + durationSlots <= dayIndexes.length; k++) {
        const span = dayIndexes.slice(k, k + durationSlots);
        const first = slots[span[0]!]!;
        const last = slots[span[span.length - 1]!]!;
        const ok = teacherIds.every((tid) => {
          const w = availByTeacher.get(tid);
          if (!w) return true; // aucune contrainte declaree
          return teacherFreeAt(w.avail, w.unavail, w.avail.length > 0, first.day_of_week, hmToMin(first.starts_at), hmToMin(last.ends_at));
        });
        if (ok) candidateStartSlots.push(span[0]!);
      }
    }

    if (candidateStartSlots.length === 0) {
      problems.push(`« ${label} » : aucun creneau compatible (duree ${durMin} min ou disponibilites des enseignants).`);
      continue;
    }

    const teacherIndexes = teacherIds.map((id) => teacherIx.get(id));
    const classIndexes = classIds.map((id) => classIx.get(id));
    const groupIndexes = groupIds.map((id) => groupIx.get(id));
    const candidateRooms = roomResult.roomIds.map((id) => roomIx.get(id));

    for (let n = 0; n < r.sessions_count; n++) {
      const index = tasks.length;
      tasks.push({
        index,
        durationSlots,
        candidateStartSlots,
        candidateRooms,
        teacherIndexes,
        classIndexes,
        groupIndexes,
        locked: false,
        fixedStartSlot: null,
        fixedRoom: null,
        priority: 100,
        label,
      });
      taskMeta.push({ requirement: r, durationSlots, classIds, groupIds, teacherIds, candidateRoomIds: roomResult.roomIds });
    }
  }

  if (tasks.length === 0) {
    throw new ValidationError(
      `Impossible de constituer le probleme :\n- ${problems.join('\n- ') || 'aucune tache exploitable.'}`,
    );
  }

  // group -> classes en indices
  const groupParentClasses: Record<string, number[]> = {};
  for (const [gid, gIndex] of groupIx.entries()) {
    const classes = (groupToClasses.get(gid) ?? []).filter((c) => classIx.has(c)).map((c) => classIx.get(c));
    if (classes.length > 0) groupParentClasses[String(gIndex)] = classes;
  }

  // index de salle -> uuid, pour relier les affectations aux salles reelles.
  const roomIdByIndex = new Map<number, string>();
  for (const [rid, ri] of roomIx.entries()) roomIdByIndex.set(ri, rid);

  // --- verification arithmetique (rapide, avant tout appel solveur) ---
  const totalSlots = slots.length;
  const preCheck = arithmeticPrecheck(tasks, taskMeta, teacherIx, classIx, availByTeacher, slots, dayToIndexes, slotMinutes, totalSlots);
  const allProblems = [...problems, ...preCheck];

  // --- job (garde-fou : une seule generation a la fois, ADR-014) ---
  const timeout = Math.min(180, Math.max(20, tasks.length)); // borne le temps sur 1 vCPU
  let jobId: string;
  const requestId = crypto.randomUUID();
  {
    const { data: job, error } = await supabase
      .from('schedule_generation_jobs')
      .insert({
        school_id: ctx.school.id,
        academic_year_id: yearId,
        status: 'RUNNING',
        requested_by: ctx.user.id,
        current_step: 'solving',
        options: { requestId, scope: 'SCHOOL', taskCount: tasks.length },
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) {
      // 23505 sur l'index partiel « une seule RUNNING » = generation concurrente
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('Une generation est deja en cours. Reessayez dans un instant.');
      }
      throw error;
    }
    jobId = job.id;
  }

  // Si l'arithmetique conclut deja a l'infaisabilite, ne pas lancer le solveur.
  if (allProblems.length > 0) {
    return finishInfeasible(ctx, jobId, tasks.length, allProblems, undefined);
  }

  // --- resolution ---
  const input: ScheduleInput = {
    requestId,
    slotCount: totalSlots,
    roomCount: roomIx.size,
    groupParentClasses,
    timeoutSeconds: timeout,
    workers: 1,
    tasks,
  };

  let solution;
  try {
    solution = await getSolver().solve(input);
  } catch (err) {
    const message = err instanceof SolverError ? err.message : 'Erreur inattendue du solveur.';
    await failJob(ctx, jobId, message);
    return { jobId, status: 'FAILED', taskCount: tasks.length, assignedCount: 0, diagnostics: [], message };
  }

  if (solution.status === 'INFEASIBLE' || (solution.assignments.length === 0)) {
    const diag = translateInfeasibility(solution, taskMeta);
    return finishInfeasible(ctx, jobId, tasks.length, diag, solution.status);
  }

  // --- materialisation : version BROUILLON + seances ---
  try {
    const versionId = await materializeDraft(ctx, yearId, jobId, solution, taskMeta, slots, slotMinutes, roomIdByIndex);

    // Post-validation INDEPENDANTE : le validateur pur doit confirmer 0 conflit
    // dur. S'il en trouve, le solveur et le validateur divergent : incoherence
    // bloquante (docs/SOLVER_API.md §5) — on annule la version.
    const vsessions = await loadValidatorSessions(ctx, versionId);
    const map = buildGroupClassMap(vsessions, groupToClasses);
    const conflicts = detectConflicts(vsessions, map);
    if (conflicts.length > 0) {
      await supabase.from('schedule_versions').delete().eq('school_id', ctx.school.id).eq('id', versionId);
      const message = `Incoherence : le solveur a rendu une solution que le validateur rejette (${conflicts[0]!.message}).`;
      await failJob(ctx, jobId, message);
      return { jobId, status: 'FAILED', taskCount: tasks.length, assignedCount: solution.assignments.length, diagnostics: [], message };
    }

    await supabase
      .from('schedule_generation_jobs')
      .update({
        status: 'SUCCEEDED',
        solver_status: solution.status,
        schedule_version_id: versionId,
        sessions_count: solution.assignments.length,
        variables_count: solution.statistics.variables,
        constraints_count: solution.statistics.constraints,
        duration_ms: solution.statistics.wallTimeMs,
        current_step: 'done',
        finished_at: new Date().toISOString(),
      })
      .eq('school_id', ctx.school.id)
      .eq('id', jobId);

    await audit(ctx, {
      action: 'schedule.generate',
      module: 'schedule',
      entityType: 'schedule_generation_job',
      entityId: jobId,
      after: { versionId, assigned: solution.assignments.length, status: solution.status },
    });

    return {
      jobId,
      status: 'SUCCEEDED',
      solverStatus: solution.status,
      versionId,
      taskCount: tasks.length,
      assignedCount: solution.assignments.length,
      diagnostics: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la creation de la version.';
    await failJob(ctx, jobId, message);
    return { jobId, status: 'FAILED', taskCount: tasks.length, assignedCount: 0, diagnostics: [], message };
  }
}

// ---------------------------------------------------------------------------
// Observabilite : historique des generations
// ---------------------------------------------------------------------------

export type GenerationJobRow = {
  id: string;
  status: string;
  solver_status: string | null;
  sessions_count: number | null;
  duration_ms: number | null;
  created_at: string;
  problems: string[];
};

export async function listGenerationJobs(ctx: TenantContext, yearId: string, limit = 5): Promise<GenerationJobRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('schedule_generation_jobs')
    .select('id, status, solver_status, sessions_count, duration_ms, queued_at, diagnostics')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('queued_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as {
    id: string;
    status: string;
    solver_status: string | null;
    sessions_count: number | null;
    duration_ms: number | null;
    queued_at: string;
    diagnostics: { problems?: unknown } | null;
  }[]).map((j) => ({
    id: j.id,
    status: j.status,
    solver_status: j.solver_status,
    sessions_count: j.sessions_count,
    duration_ms: j.duration_ms,
    created_at: j.queued_at,
    problems: Array.isArray(j.diagnostics?.problems)
      ? (j.diagnostics!.problems as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
  }));
}

// ---------------------------------------------------------------------------
// Materialisation d'une version brouillon
// ---------------------------------------------------------------------------

async function materializeDraft(
  ctx: TenantContext,
  yearId: string,
  jobId: string,
  solution: ScheduleSolution,
  taskMeta: TaskMeta[],
  slots: Slot[],
  slotMinutes: number,
  roomIdByIndex: Map<number, string>,
): Promise<string> {
  const supabase = await createClient();

  const { data: last } = await supabase
    .from('schedule_versions')
    .select('number')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const number = (last?.number ?? 0) + 1;

  const { data: version, error: vErr } = await supabase
    .from('schedule_versions')
    .insert({
      school_id: ctx.school.id,
      academic_year_id: yearId,
      number,
      name: `Generation ${number}`,
      status: 'DRAFT',
      source: 'GENERATED',
      generation_job_id: jobId,
      created_by: ctx.user.id,
    })
    .select('id')
    .single();
  if (vErr) throw vErr;
  const versionId = version.id;

  for (const a of solution.assignments) {
    const meta = taskMeta[a.taskIndex];
    if (!meta) continue;
    const startSlot = slots[a.startSlot]!;
    const lastSlot = slots[a.endSlot - 1] ?? startSlot;
    const duration = (a.endSlot - a.startSlot) * slotMinutes;

    const { data: session, error: sErr } = await supabase
      .from('schedule_sessions')
      .insert({
        school_id: ctx.school.id,
        academic_year_id: yearId,
        schedule_version_id: versionId,
        teaching_requirement_id: meta.requirement.id,
        subject_id: meta.requirement.subject_id,
        day_of_week: startSlot.day_of_week,
        start_slot_id: startSlot.id,
        end_slot_id: lastSlot.id,
        starts_at: startSlot.starts_at,
        ends_at: lastSlot.ends_at,
        duration_minutes: duration,
        status: 'PLANNED',
      } satisfies TablesInsert<'schedule_sessions'>)
      .select('id')
      .single();
    if (sErr) throw sErr;

    const targets: TablesInsert<'schedule_session_targets'>[] = [
      ...meta.classIds.map((cid) => ({ school_id: ctx.school.id, session_id: session.id, target_type: 'CLASS' as const, class_id: cid })),
      ...meta.groupIds.map((gid) => ({ school_id: ctx.school.id, session_id: session.id, target_type: 'GROUP' as const, group_id: gid })),
    ];
    if (targets.length > 0) await supabase.from('schedule_session_targets').insert(targets);

    if (meta.teacherIds.length > 0) {
      await supabase.from('schedule_session_teachers').insert(
        meta.teacherIds.map((tid, i) => ({
          school_id: ctx.school.id,
          session_id: session.id,
          teacher_id: tid,
          role: i === 0 ? ('LEAD' as const) : ('ASSISTANT' as const),
        })),
      );
    }

    const roomId = a.room >= 0 ? roomIdByIndex.get(a.room) : undefined;
    if (roomId) {
      await supabase.from('schedule_session_rooms').insert({ school_id: ctx.school.id, session_id: session.id, room_id: roomId, is_primary: true });
    }
  }

  return versionId;
}

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

function translateInfeasibility(
  solution: ScheduleSolution,
  taskMeta: TaskMeta[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };
  for (const t of solution.emptyDomainTasks) {
    const meta = taskMeta[t];
    if (meta) push(`« ${meta.requirement.subjects?.name ?? 'Cours'} — ${targetLabel(meta.requirement)} » : aucun creneau possible.`);
  }
  if (solution.infeasibleCore.length > 0) {
    const labels = solution.infeasibleCore
      .map((t) => taskMeta[t])
      .filter((m): m is TaskMeta => !!m)
      .map((m) => `${m.requirement.subjects?.name ?? 'Cours'} — ${targetLabel(m.requirement)}`);
    const uniq = [...new Set(labels)];
    push(`Ces enseignements ne peuvent pas coexister sur la grille : ${uniq.join(' ; ')}.`);
  }
  if (out.length === 0) {
    push('Le solveur n\'a trouve aucun placement possible. Ajoutez des creneaux, des salles, ou reduisez le nombre de seances.');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verification arithmetique
// ---------------------------------------------------------------------------

function arithmeticPrecheck(
  tasks: SolverTask[],
  taskMeta: TaskMeta[],
  teacherIx: Indexer,
  classIx: Indexer,
  availByTeacher: Map<string, { avail: Window[]; unavail: Window[] }>,
  slots: Slot[],
  dayToIndexes: Map<number, number[]>,
  slotMinutes: number,
  totalSlots: number,
): string[] {
  const problems: string[] = [];

  // Besoin par enseignant vs creneaux ou il est libre.
  const needByTeacher = new Map<string, number>();
  tasks.forEach((t, i) => {
    for (const tid of taskMeta[i]!.teacherIds) {
      needByTeacher.set(tid, (needByTeacher.get(tid) ?? 0) + t.durationSlots);
    }
  });
  for (const [tid, need] of needByTeacher) {
    const w = availByTeacher.get(tid);
    let free = totalSlots;
    if (w && w.avail.length > 0) {
      free = slots.filter((s) => teacherFreeAt(w.avail, w.unavail, true, s.day_of_week, hmToMin(s.starts_at), hmToMin(s.ends_at))).length;
    } else if (w) {
      free = slots.filter((s) => teacherFreeAt(w.avail, w.unavail, false, s.day_of_week, hmToMin(s.starts_at), hmToMin(s.ends_at))).length;
    }
    if (need > free) {
      const name = teacherNameOf(tid, taskMeta);
      problems.push(`Enseignant ${name} : ${need} creneau(x) necessaires, ${free} seulement disponible(s).`);
    }
  }

  // Besoin par classe entiere vs total de creneaux.
  const needByClass = new Map<string, number>();
  tasks.forEach((t, i) => {
    for (const cid of taskMeta[i]!.classIds) {
      needByClass.set(cid, (needByClass.get(cid) ?? 0) + t.durationSlots);
    }
  });
  for (const [cid, need] of needByClass) {
    if (need > totalSlots) {
      const name = classNameOf(cid, taskMeta);
      problems.push(`Classe ${name} : ${need} creneau(x) necessaires, la grille n'en compte que ${totalSlots}.`);
    }
  }

  void teacherIx;
  void classIx;
  void dayToIndexes;
  void slotMinutes;
  return problems;
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function resolveRooms(r: ReqRow, rooms: { id: string; room_type_id: string | null; capacity: number }[]): { roomIds: string[]; error?: string } {
  const minCap = r.min_capacity ?? 0;
  const withCap = rooms.filter((x) => x.capacity >= minCap);
  switch (r.room_requirement_mode) {
    case 'REQUIRED_ROOM': {
      const room = rooms.find((x) => x.id === r.required_room_id);
      if (!room) return { roomIds: [], error: 'la salle imposee est introuvable ou inactive.' };
      return { roomIds: [room.id] };
    }
    case 'REQUIRED_TYPE': {
      const list = withCap.filter((x) => x.room_type_id === r.required_room_type_id).map((x) => x.id);
      if (list.length === 0) return { roomIds: [], error: 'aucune salle du type impose ne convient (capacite ?).' };
      return { roomIds: list };
    }
    case 'PREFERRED': {
      // Preference non optimisee en v1.0.0 : on autorise toutes les salles
      // compatibles (la salle preferee en fait partie).
      return { roomIds: withCap.map((x) => x.id) };
    }
    case 'NONE':
    default:
      return { roomIds: [] };
  }
}

function targetLabel(r: ReqRow): string {
  return (
    r.teaching_requirement_targets
      .map((t) => (t.target_type === 'CLASS' ? t.classes?.name : t.groups?.name) ?? '?')
      .join(' + ') || '?'
  );
}

function teacherNameOf(tid: string, metas: TaskMeta[]): string {
  for (const m of metas) {
    const t = m.requirement.teaching_requirement_teachers.find((x) => x.teacher_id === tid);
    if (t?.teachers) return `${t.teachers.last_name.toUpperCase()} ${t.teachers.first_name}`;
  }
  return 'inconnu';
}

function classNameOf(cid: string, metas: TaskMeta[]): string {
  for (const m of metas) {
    const t = m.requirement.teaching_requirement_targets.find((x) => x.class_id === cid);
    if (t?.classes) return t.classes.name;
  }
  return 'inconnue';
}

function buildGroupClassMap(sessions: ValidatorSession[], groupToClasses: Map<string, string[]>): Map<string, string> {
  // Le validateur independant retient une classe par groupe. En presence de
  // plusieurs classes (§16), on prend la premiere : le solveur reste l'autorite,
  // ce controle est une defense en profondeur.
  const map = new Map<string, string>();
  for (const s of sessions) {
    for (const g of s.groupIds) {
      const classes = groupToClasses.get(g);
      if (classes && classes[0]) map.set(g, classes[0]);
    }
  }
  return map;
}

async function finishInfeasible(
  ctx: TenantContext,
  jobId: string,
  taskCount: number,
  diagnostics: string[],
  solverStatus: string | undefined,
): Promise<GenerationResult> {
  const supabase = await createClient();
  // Le cycle de vie du job (generation_job_status) ne comporte pas d'etat
  // « infaisable » distinct : on marque FAILED et on conserve la verite du
  // solveur dans solver_status (= INFEASIBLE / TIME_LIMIT / UNKNOWN), plus le
  // diagnostic traduit. L'UI etiquette « Impossible » a partir de solver_status.
  await supabase
    .from('schedule_generation_jobs')
    .update({
      status: 'FAILED',
      solver_status: (solverStatus ?? 'INFEASIBLE') as 'INFEASIBLE' | 'TIME_LIMIT' | 'UNKNOWN' | 'OPTIMAL' | 'FEASIBLE',
      hard_satisfied: false,
      diagnostics: { problems: diagnostics },
      current_step: 'infeasible',
      finished_at: new Date().toISOString(),
    })
    .eq('school_id', ctx.school.id)
    .eq('id', jobId);
  await audit(ctx, { action: 'schedule.generate_infeasible', module: 'schedule', entityType: 'schedule_generation_job', entityId: jobId, after: { count: diagnostics.length } });
  return { jobId, status: 'INFEASIBLE', ...(solverStatus ? { solverStatus } : {}), taskCount, assignedCount: 0, diagnostics };
}

async function failJob(ctx: TenantContext, jobId: string, message: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('schedule_generation_jobs')
    .update({ status: 'FAILED', error: { message }, current_step: 'failed', finished_at: new Date().toISOString() })
    .eq('school_id', ctx.school.id)
    .eq('id', jobId);
}

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

type ReqRow = {
  id: string;
  subject_id: string;
  weekly_minutes: number;
  sessions_count: number;
  session_duration_minutes: number | null;
  room_requirement_mode: 'NONE' | 'PREFERRED' | 'REQUIRED_ROOM' | 'REQUIRED_TYPE';
  required_room_id: string | null;
  required_room_type_id: string | null;
  preferred_room_id: string | null;
  min_capacity: number | null;
  subjects: { name: string } | null;
  teaching_requirement_targets: {
    target_type: 'CLASS' | 'GROUP';
    class_id: string | null;
    group_id: string | null;
    classes: { name: string } | null;
    groups: { name: string } | null;
  }[];
  teaching_requirement_teachers: { teacher_id: string; teachers: { first_name: string; last_name: string } | null }[];
};

type TaskMeta = {
  requirement: ReqRow;
  durationSlots: number;
  classIds: string[];
  groupIds: string[];
  teacherIds: string[];
  candidateRoomIds: string[];
};

/** Attribue des indices compacts stables (0..N-1) a des uuid. */
class Indexer {
  private map = new Map<string, number>();
  get(id: string): number {
    let i = this.map.get(id);
    if (i === undefined) {
      i = this.map.size;
      this.map.set(id, i);
    }
    return i;
  }
  has(id: string): boolean {
    return this.map.has(id);
  }
  entries(): [string, number][] {
    return [...this.map.entries()];
  }
  get size(): number {
    return this.map.size;
  }
}
