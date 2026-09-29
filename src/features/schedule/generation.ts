import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { ConflictError, ValidationError } from '@/lib/errors';
import type { TablesInsert } from '@/types/database';
import { detectConflicts, type ValidatorSession } from '@/lib/schedule/validator';
import { getConfig, getConfigForCycle, listCyclesOverview } from './config';
import { loadValidatorSessions } from './sessions';
import { listRules } from './constraints/service';
import {
  blockingRules,
  gapPenalties,
  loadLimits,
  ruleAppliesTo,
  slotPenalties,
  spreadLimits,
  type CourseTask,
  type SlotInfo,
} from './constraints/apply';
import { lockedPlacements } from './constraints/locks';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { getSolver, SolverError, type FixedOccupation, type ScheduleInput, type ScheduleSolution, type SolverTask } from './solver';

// ---------------------------------------------------------------------------
// Types de resultat, exposes a l'UI
// ---------------------------------------------------------------------------

export type GenerationResult = {
  jobId: string;
  status: 'SUCCEEDED' | 'INFEASIBLE' | 'FAILED';
  /** Somme pondérée des préférences non satisfaites. 0 = tout est respecté. */
  penalty?: number;
  /** Le détail, préférence par préférence, la plus coûteuse en tête. */
  penaltyDetails?: { label: string; penalty: number }[];
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
export async function generateSchedule(
  ctx: TenantContext,
  yearId: string,
  cycleId?: string,
  targetVersionId?: string,
  seed?: number,
): Promise<GenerationResult> {
  requireWritable(ctx, 'schedule.generate');
  const supabase = await createClient();

  const config = cycleId ? await getConfigForCycle(ctx, yearId, cycleId) : await getConfig(ctx, yearId);
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
  if (slots.length === 0) throw new ValidationError('La grille horaire ne contient aucun créneau.');

  const slotIndexById = new Map<string, number>();
  slots.forEach((s, i) => slotIndexById.set(s.id, i));
  // Indices globaux groupes par jour, dans l'ordre des positions.
  // Dernier creneau de chaque journee : « jamais en derniere heure » s'y appuie.
  const lastOfDayIndexes = new Set<number>();

  const dayToIndexes = new Map<number, number[]>();
  slots.forEach((s, i) => {
    const list = dayToIndexes.get(s.day_of_week) ?? [];
    list.push(i);
    dayToIndexes.set(s.day_of_week, list);
  });
  for (const indexes of dayToIndexes.values()) {
    const last = indexes[indexes.length - 1];
    if (last !== undefined) lastOfDayIndexes.add(last);
  }

  // --- exigences a placer ---
  // Lecture par curseur : au-dela de 1 000 lignes, une lecture simple serait
  // tronquee par PostgREST sans erreur — l'emploi du temps genere aurait
  // silencieusement oublie des cours. Un lycee de 5 000 eleves y est.
  const requirements = await fetchAllRows<ReqRow>((cursor) => {
    let q = supabase
      .from('teaching_requirements')
      .select(
        'id, subject_id, weekly_minutes, sessions_count, session_duration_minutes, ' +
          'room_requirement_mode, required_room_id, required_room_type_id, preferred_room_id, ' +
          'preferred_room_type_id, min_capacity, required_features, ' +
          'subjects(name), ' +
          'teaching_requirement_targets(target_type, class_id, group_id, classes(name), groups(name)), ' +
          'teaching_requirement_teachers(teacher_id, teachers(first_name, last_name))',
      )
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('status', 'ACTIVE')
      .order('id') // curseur : tri total requis (cf. lib/supabase/pagination)
      .limit(200);
    if (cursor) q = q.gt('id', cursor);
    return q as unknown as PromiseLike<{ data: ReqRow[] | null; error: { message: string } | null }>;
  }, 200);
  if (requirements.length === 0) {
    throw new ValidationError('Aucune exigence pédagogique active. Synchronisez-les depuis les affectations.');
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
    .select('id, room_type_id, capacity, is_active, room_room_features(feature_id)')
    .eq('school_id', ctx.school.id)
    .eq('is_active', true);
  const rooms = ((roomRows ?? []) as unknown as {
    id: string;
    room_type_id: string | null;
    capacity: number;
    is_active: boolean;
    room_room_features: { feature_id: string }[];
  }[]).map((r) => ({
    id: r.id,
    room_type_id: r.room_type_id,
    capacity: r.capacity,
    features: (r.room_room_features ?? []).map((f) => f.feature_id),
  }));

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

  // --- portee cycle : cette generation ne sait traiter qu'une seule grille a
  // la fois (§ decision "pause par cycle"). Sans cycle precise, on exclut les
  // classes dont le cycle a SA PROPRE grille (traitees a part, dans un
  // lancement dedie) ; avec un cycle precise, on exclut au contraire tout ce
  // qui n'appartient PAS a ce cycle. Dans les deux cas, l'exigence hors
  // perimetre est signalee plutot que placee a tort sur la mauvaise grille.
  const cyclesOverview = await listCyclesOverview(ctx, yearId);
  const cyclesWithOwnGrid = new Set(cyclesOverview.filter((c) => c.configId).map((c) => c.id));
  const { data: classCycleRows } = await supabase
    .from('classes')
    .select('id, level_id, levels(cycle_id)')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId);
  // Le niveau de chaque classe : une regle posee sur un NIVEAU vise tous les
  // cours de ses classes, et le cours ne connait que ses classes.
  const classToLevel = new Map(
    ((classCycleRows ?? []) as unknown as { id: string; level_id: string | null }[]).map((row) => [row.id, row.level_id]),
  );

  // Les regles DURES de l'annee, actives seulement. Une preference n'a aucun
  // effet ici : elle appartient a la fonction d'objectif, pas au filtrage.
  // Seances figees par l'ecole : elles doivent retrouver EXACTEMENT leur place.
  const locks = await lockedPlacements(ctx, yearId, targetVersionId);
  const locksByRequirement = new Map<string, typeof locks>();
  for (const lock of locks) {
    const list = locksByRequirement.get(lock.requirementId) ?? [];
    list.push(lock);
    locksByRequirement.set(lock.requirementId, list);
  }
  const lostLocks: string[] = [];

  const allRules = (await listRules(ctx)).filter((r) => r.enabled);
  const asActive = (r: (typeof allRules)[number]) => ({
    code: r.code,
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    params: r.params,
    summary: r.summary,
  });
  const hardRules = allRules.filter((r) => r.severity === 'HARD').map(asActive);
  const softRules = allRules.filter((r) => r.severity === 'SOFT').map(asActive);
  // Le poids que l'ecole a donne a chaque preference.
  const weightByRule = new Map(allRules.map((r) => [r.summary, Math.max(1, r.weight || 10)]));
  const weightOf = (rule: { summary: string }) => weightByRule.get(rule.summary) ?? 10;

  const classToCycle = new Map(
    ((classCycleRows ?? []) as unknown as { id: string; levels: { cycle_id: string } | null }[]).map((row) => [
      row.id,
      row.levels?.cycle_id ?? null,
    ]),
  );
  function usesOtherGrid(classIds: string[], groupIds: string[]): boolean {
    const allClassIds = [...classIds, ...groupIds.flatMap((g) => groupToClasses.get(g) ?? [])];
    if (cycleId) return allClassIds.some((cid) => classToCycle.get(cid) !== cycleId);
    return allClassIds.some((cid) => {
      const cid2 = classToCycle.get(cid);
      return cid2 != null && cyclesWithOwnGrid.has(cid2);
    });
  }

  // --- construction des taches ---
  const tasks: SolverTask[] = [];
  const taskMeta: TaskMeta[] = [];
  // Portee de chaque tache : une regle de charge vise un ensemble de seances,
  // pas une seance isolee. On la retient au fur et a mesure.
  const courseTasks: CourseTask[] = [];
  const problems: string[] = [];
  // Notices de portee (hors cycle vise) : purement informatives — une
  // generation par cycle exclut TOUJOURS les exigences des autres cycles,
  // ce n'est jamais un signe d'echec. Tenues a part de `problems` pour ne
  // jamais faire avorter le lancement avant meme d'appeler le solveur.
  const excluded: string[] = [];

  for (const r of requirements) {
    const label = `${r.subjects?.name ?? 'Cours'} — ${targetLabel(r)}`;
    const durMin = r.session_duration_minutes ?? Math.round(r.weekly_minutes / Math.max(1, r.sessions_count));
    const durationSlots = Math.max(1, Math.round(durMin / slotMinutes));

    const teacherIds = r.teaching_requirement_teachers.map((t) => t.teacher_id);
    const classIds = r.teaching_requirement_targets.filter((t) => t.target_type === 'CLASS' && t.class_id).map((t) => t.class_id!);
    const groupIds = r.teaching_requirement_targets.filter((t) => t.target_type === 'GROUP' && t.group_id).map((t) => t.group_id!);

    if (usesOtherGrid(classIds, groupIds)) {
      excluded.push(
        cycleId
          ? `« ${label} » : ne cible pas une classe de ce cycle — ignoree dans ce lancement.`
          : `« ${label} » : cible une classe dont le cycle a ses propres horaires — generez-la depuis ce cycle (page de génération, selecteur de cycle).`,
      );
      continue;
    }

    // candidats salle selon le mode
    const roomResult = resolveRooms(r, rooms);
    if (roomResult.error) {
      problems.push(`« ${label} » : ${roomResult.error}`);
      continue;
    }

    // creneaux de depart candidats : tenue dans la journee (span REELLEMENT
    // contigu, sans pause entre deux creneaux — cf. dayToIndexes) et
    // disponibilite de TOUS les enseignants de la seance sur toute la duree.
    const courseScope = {
      subjectId: r.subject_id,
      classIds,
      levelIds: [...new Set(classIds.map((cid) => classToLevel.get(cid)).filter((l): l is string => !!l))],
      teacherIds,
    };
    const blockedBy = new Set<string>();

    const candidateStartSlots: number[] = [];
    for (const [, dayIndexes] of dayToIndexes) {
      for (let k = 0; k + durationSlots <= dayIndexes.length; k++) {
        const span = dayIndexes.slice(k, k + durationSlots);
        let contiguous = true;
        for (let j = 0; j < span.length - 1; j++) {
          if (slots[span[j]!]!.ends_at !== slots[span[j + 1]!]!.starts_at) { contiguous = false; break; }
        }
        if (!contiguous) continue;
        const first = slots[span[0]!]!;
        const last = slots[span[span.length - 1]!]!;
        const ok = teacherIds.every((tid) => {
          const w = availByTeacher.get(tid);
          if (!w) return true; // aucune contrainte declaree
          return teacherFreeAt(w.avail, w.unavail, w.avail.length > 0, first.day_of_week, hmToMin(first.starts_at), hmToMin(last.ends_at));
        });
        if (!ok) continue;

        // Les regles dures de l'ecole retirent leurs creneaux : le solveur ne
        // les voit jamais, il ne peut donc pas les choisir.
        const window = {
          day: first.day_of_week,
          startMin: hmToMin(first.starts_at),
          endMin: hmToMin(last.ends_at),
        };
        // « Jamais en derniere heure » posee en DURE se traite ici, comme un
        // moment interdit : le creneau disparait des candidats.
        if (
          lastOfDayIndexes.has(span[0]!) &&
          hardRules.some((r) => r.code === 'NOT_LAST_SLOT' && ruleAppliesTo(r, courseScope))
        ) {
          blockedBy.add('Jamais en dernière heure');
          continue;
        }

        const blocked = blockingRules(hardRules, courseScope, window);
        if (blocked.length > 0) {
          for (const b of blocked) blockedBy.add(b.summary);
          continue;
        }
        candidateStartSlots.push(span[0]!);
      }
    }

    if (candidateStartSlots.length === 0) {
      problems.push(
        blockedBy.size > 0
          ? `« ${label} » : aucun créneau compatible — vos règles l'interdisent partout (${[...blockedBy].join(' ; ')}).`
          : `« ${label} » : aucun créneau compatible (durée ${durMin} min ou disponibilités des enseignants).`,
      );
      continue;
    }

    const teacherIndexes = teacherIds.map((id) => teacherIx.get(id));
    const classIndexes = classIds.map((id) => classIx.get(id));
    const groupIndexes = groupIds.map((id) => groupIx.get(id));
    const candidateRooms = roomResult.roomIds.map((id) => roomIx.get(id));

    const myLocks = locksByRequirement.get(r.id) ?? [];

    // « Grouper les séances » : une règle DURE fusionne les séances en blocs.
    // Deux séances groupées deviennent une seule tâche de deux créneaux — le
    // solveur n'a donc aucun concept nouveau à apprendre, et la contiguïté est
    // garantie par construction. Une règle souple reste sans effet ici : on ne
    // fusionne pas « si possible ».
    const blockRule = hardRules.find((x) => x.code === 'BLOCK_SESSIONS' && ruleAppliesTo(x, courseScope));
    const blockSize = blockRule ? Math.max(2, Number(blockRule.params.size) || 2) : 1;
    const wholeBlocks = blockSize > 1 ? Math.floor(r.sessions_count / blockSize) : 0;
    const leftover = r.sessions_count - wholeBlocks * blockSize;
    const plan: number[] = [
      ...Array.from({ length: wholeBlocks }, () => blockSize * durationSlots),
      ...Array.from({ length: leftover }, () => durationSlots),
    ];

    for (let n = 0; n < plan.length; n++) {
      const index = tasks.length;
      courseTasks.push({ taskIndex: index, scope: courseScope });

      // Les seances verrouillees passent en premier : la n-ieme tache reprend
      // le n-ieme verrou. Un verrou dont le creneau n'existe plus dans la
      // grille est abandonne et signale — le taire replacerait le cours
      // ailleurs sans que personne le sache.
      const lock = myLocks[n];
      let fixedStartSlot: number | null = null;
      let fixedRoom: number | null = null;
      if (lock) {
        const slotIndex = slotIndexById.get(lock.startSlotId);
        if (slotIndex === undefined) {
          lostLocks.push(`« ${lock.label} » : son créneau verrouillé n'existe plus dans la grille horaire.`);
        } else {
          fixedStartSlot = slotIndex;
          const roomIndex = lock.roomId ? roomIx.get(lock.roomId) : undefined;
          fixedRoom = roomIndex === undefined ? null : roomIndex;
        }
      }

      const thisDuration = plan[n] ?? durationSlots;
      // Un bloc ne tient pas forcément partout : on écarte les départs trop
      // tardifs dans la journée plutôt que de laisser le solveur échouer.
      const startsForThis =
        thisDuration === durationSlots
          ? candidateStartSlots
          : candidateStartSlots.filter((startIndex) => {
              const day = slots[startIndex]!.day_of_week;
              const dayList = dayToIndexes.get(day) ?? [];
              const at = dayList.indexOf(startIndex);
              return at >= 0 && at + thisDuration <= dayList.length;
            });
      if (startsForThis.length === 0) {
        problems.push(`« ${label} » : un bloc de ${thisDuration} créneaux ne tient dans aucune journée.`);
        break;
      }

      tasks.push({
        index,
        durationSlots: thisDuration,
        candidateStartSlots: startsForThis,
        candidateRooms,
        teacherIndexes,
        classIndexes,
        groupIndexes,
        locked: fixedStartSlot !== null,
        fixedStartSlot,
        fixedRoom,
        priority: 100,
        label,
      });
      taskMeta.push({
        requirement: r,
        durationSlots: thisDuration,
        classIds,
        groupIds,
        teacherIds,
        candidateRoomIds: roomResult.roomIds,
        preferredRoomIds: roomResult.preferredIds ?? [],
      });
    }
  }

  if (tasks.length === 0) {
    throw new ValidationError(
      `Impossible de constituer le problème :\n- ${[...problems, ...excluded].join('\n- ') || 'aucune tache exploitable.'}`,
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

  // --- occupations fixes issues d'un cycle deja materialise dans la meme
  // version (generation par cycle en plusieurs passes, § "pause par cycle") :
  // un enseignant (ou une salle partagee, ex. EPS) peut intervenir dans deux
  // cycles a la fois reelle qui se chevauche, meme si chaque cycle a sa
  // propre grille de creneaux. Le solveur de CE lancement ne connait que ses
  // propres taches ; sans ceci, rien ne l'empeche de re-placer un enseignant
  // (ou une salle) deja occupe par l'autre cycle au meme moment reel — d'ou
  // le controle uniquement detecte APRES coup par le validateur independant.
  const fixedOccupations: FixedOccupation[] = [];
  if (targetVersionId) {
    const existingSessions = await loadValidatorSessions(ctx, targetVersionId);
    for (const s of existingSessions) {
      const relevantTeachers = s.teacherIds.filter((tid) => teacherIx.has(tid)).map((tid) => teacherIx.get(tid));
      const relevantRooms = s.roomIds.filter((rid) => roomIx.has(rid)).map((rid) => roomIx.get(rid));
      if (relevantTeachers.length === 0 && relevantRooms.length === 0) continue;
      for (const idx of dayToIndexes.get(s.dayOfWeek) ?? []) {
        const slot = slots[idx]!;
        const slotStart = hmToMin(slot.starts_at);
        const slotEnd = hmToMin(slot.ends_at);
        if (slotStart >= s.endMin || s.startMin >= slotEnd) continue; // pas de chevauchement reel
        for (const t of relevantTeachers) {
          fixedOccupations.push({ startSlot: idx, durationSlots: 1, teacherIndexes: [t], classIndexes: [], groupIndexes: [], roomIndex: null });
        }
        for (const r of relevantRooms) {
          fixedOccupations.push({ startSlot: idx, durationSlots: 1, teacherIndexes: [], classIndexes: [], groupIndexes: [], roomIndex: r });
        }
      }
    }
  }

  // --- salles indisponibles chaque semaine (salle pretee, club, reunion) ---
  // Une regle hebdomadaire ferme la salle au meme creneau toutes les semaines :
  // on l'exprime comme une occupation fixe de cette salle, exactement comme un
  // cours deja pose. Le solveur n'a donc rien de nouveau a apprendre.
  const { data: roomRules } = await supabase
    .from('room_availability')
    .select('room_id, day_of_week, starts_at, ends_at')
    .eq('school_id', ctx.school.id)
    .eq('academic_year_id', yearId)
    .eq('kind', 'UNAVAILABLE');
  for (const rule of (roomRules ?? []) as { room_id: string; day_of_week: number; starts_at: string; ends_at: string }[]) {
    if (!roomIx.has(rule.room_id)) continue;
    const r = roomIx.get(rule.room_id);
    const from = hmToMin(rule.starts_at);
    const to = hmToMin(rule.ends_at);
    for (const idx of dayToIndexes.get(rule.day_of_week) ?? []) {
      const slot = slots[idx]!;
      if (hmToMin(slot.starts_at) >= to || from >= hmToMin(slot.ends_at)) continue;
      fixedOccupations.push({ startSlot: idx, durationSlots: 1, teacherIndexes: [], classIndexes: [], groupIndexes: [], roomIndex: r });
    }
  }

  // --- verification arithmetique (rapide, avant tout appel solveur) ---
  const totalSlots = slots.length;
  const preCheck = arithmeticPrecheck(tasks, taskMeta, teacherIx, classIx, availByTeacher, slots, dayToIndexes, slotMinutes, totalSlots);
  const allProblems = [...problems, ...preCheck];
  // Un verrou perdu n'empeche pas de generer : il se signale dans le bilan.
  const notices = [...excluded, ...lostLocks];

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
        throw new ConflictError('Une génération est déjà en cours. Réessayez dans un instant.');
      }
      throw error;
    }
    jobId = job.id;
  }

  // Si l'arithmetique conclut deja a l'infaisabilite, ne pas lancer le solveur.
  // (`excluded` — hors de la portee du cycle vise — n'est jamais un motif
  // d'echec : c'est le fonctionnement normal d'une generation par cycle.)
  if (allProblems.length > 0) {
    return finishInfeasible(ctx, jobId, tasks.length, [...allProblems, ...notices], undefined);
  }

  // --- resolution ---
  // Les créneaux décrits pour les préférences : demi-journée, dernier du jour.
  const slotInfos: SlotInfo[] = slots.map((slot, index) => ({
    index,
    day: slot.day_of_week,
    rank: (dayToIndexes.get(slot.day_of_week) ?? []).indexOf(index),
    lastOfDay: lastOfDayIndexes.has(index),
    startMin: hmToMin(slot.starts_at),
  }));

  const input: ScheduleInput = {
    requestId,
    slotCount: totalSlots,
    roomCount: roomIx.size,
    groupParentClasses,
    timeoutSeconds: timeout,
    workers: 1,
    // Une graine differente explore l'espace autrement : c'est ce qui permet
    // de proposer plusieurs emplois du temps valides et de les comparer.
    ...(seed === undefined ? {} : { randomSeed: seed }),
    // Sans le decoupage en journees, le solveur ne voit qu'une suite plate de
    // creneaux : il ne saurait ni compter « par jour », ni distinguer deux
    // seances separees par une nuit de deux seances qui se suivent.
    days: [...dayToIndexes.entries()].sort((a, b) => a[0] - b[0]).map(([, indexes]) => indexes),
    loadLimits: [
      ...loadLimits(hardRules, courseTasks),
      // Un plafond posé en PRÉFÉRENCE se dépasse en le payant.
      ...loadLimits(softRules, courseTasks).map((l) => ({ ...l, weight: weightOf({ summary: l.label }) })),
      ...spreadLimits(hardRules, courseTasks, () => 0).map((l) => ({ ...l, weight: null })),
      ...spreadLimits(softRules, courseTasks, weightOf),
    ],
    slotPenalties: slotPenalties(softRules, courseTasks, slotInfos, weightOf),
    gapPenalties: gapPenalties(softRules, courseTasks, weightOf),
    tasks,
    fixedOccupations,
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
  // Ce qui a ete ecrit, retenu hors du try : si la suite echoue (une lecture
  // de verification qui depasse le statement_timeout, par exemple), il faut
  // pouvoir l'effacer. Sans cela une generation marquee « echouee » laisse
  // derriere elle des centaines de seances a demi validees, que rien ne
  // distingue des bonnes.
  let written: { versionId: string; sessionIds: string[] } | null = null;
  try {
    const { versionId, sessionIds, preferenceMisses } = await materializeDraft(
      ctx, yearId, jobId, solution, taskMeta, slots, slotMinutes, roomIdByIndex, targetVersionId, fixedOccupations,
    );
    written = { versionId, sessionIds };

    // Post-validation INDEPENDANTE : le validateur pur doit confirmer 0 conflit
    // dur, sur la version ENTIERE (les deux cycles deja materialises compris —
    // c'est justement ce qui permet de detecter un enseignant/une salle
    // partage(e) entre cycles a un moment qui se chevauche reellement, ce que
    // les `fixedOccupations` ci-dessus visent a prevenir en amont). S'il en
    // trouve, le solveur et le validateur divergent : incoherence bloquante
    // (docs/SOLVER_API.md §5).
    const vsessions = await loadValidatorSessions(ctx, versionId);
    const map = buildGroupClassMap(vsessions, groupToClasses);
    const conflicts = detectConflicts(vsessions, map);
    if (conflicts.length > 0) {
      // N'annuler QUE ce que CE lancement a insere : une version ciblee
      // (targetVersionId) peut deja contenir les seances, validees, d'un
      // cycle precedent — les effacer aussi romprait ce travail deja bon.
      if (targetVersionId) {
        // Par paquets : un millier d'identifiants dans une seule URL la ferait
        // rejeter par le serveur avant meme d'arriver a la base.
        for (let i = 0; i < sessionIds.length; i += 200) {
          await supabase
            .from('schedule_sessions')
            .delete()
            .eq('school_id', ctx.school.id)
            .in('id', sessionIds.slice(i, i + 200));
        }
      } else {
        await supabase.from('schedule_versions').delete().eq('school_id', ctx.school.id).eq('id', versionId);
      }
      const message = `Incoherence : le solveur a rendu une solution que le validateur rejette (${conflicts[0]!.message}).`;
      await failJob(ctx, jobId, message);
      return { jobId, status: 'FAILED', taskCount: tasks.length, assignedCount: solution.assignments.length, diagnostics: [], message };
    }

    const successDiagnostics = [
      ...(excluded.length > 0 ? [`${excluded.length} exigence(s) hors de ce cycle — ignoree(s) dans ce lancement.`] : []),
      // Un verrou perdu doit se voir : le cours a ete replace ailleurs.
      ...lostLocks,
      ...(locks.length > lostLocks.length
        ? [`${locks.length - lostLocks.length} séance(s) verrouillée(s) conservée(s) à leur place.`]
        : []),
      ...(solution.penalty > 0
        ? [
            `${solution.penaltyDetails.length} préférence(s) non satisfaite(s) — ` +
              solution.penaltyDetails
                .slice(0, 3)
                .map((d) => `${d.label} (${d.penalty})`)
                .join(', ') +
              (solution.penaltyDetails.length > 3 ? '…' : ''),
          ]
        : ['Toutes les préférences sont respectées.']),
      ...(preferenceMisses > 0
        ? [
            `${preferenceMisses} cours n'a (ont) pas pu se tenir dans la salle souhaitée — elle était occupée : ` +
              'il(s) se tien(nen)t dans une salle ordinaire.',
          ]
        : []),
    ];

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
        diagnostics: { problems: successDiagnostics },
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
      penalty: solution.penalty,
      penaltyDetails: solution.penaltyDetails,
      diagnostics: successDiagnostics,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la création de la version.';
    // Meme regle que le rejet du validateur : on n'annule QUE ce que ce
    // lancement a insere. Une version ciblee peut contenir le travail, deja
    // bon, d'un cycle precedent.
    if (written) {
      try {
        if (targetVersionId) {
          for (let i = 0; i < written.sessionIds.length; i += 200) {
            await supabase
              .from('schedule_sessions')
              .delete()
              .eq('school_id', ctx.school.id)
              .in('id', written.sessionIds.slice(i, i + 200));
          }
        } else {
          await supabase.from('schedule_versions').delete().eq('school_id', ctx.school.id).eq('id', written.versionId);
        }
      } catch {
        // Le nettoyage a echoue lui aussi : le message d'erreur reste celui de
        // la cause, et la version brouillon reste supprimable a la main.
      }
    }
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

/** Insertion par paquets : une requete par 500 lignes, pas une par ligne. */
async function insertInChunks<T extends 'schedule_sessions' | 'schedule_session_targets' | 'schedule_session_teachers' | 'schedule_session_rooms'>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: T,
  rows: TablesInsert<T>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 500) as any);
    if (error) throw error;
  }
}

async function materializeDraft(
  ctx: TenantContext,
  yearId: string,
  jobId: string,
  solution: ScheduleSolution,
  taskMeta: TaskMeta[],
  slots: Slot[],
  slotMinutes: number,
  roomIdByIndex: Map<number, string>,
  targetVersionId: string | undefined,
  fixedOccupations: FixedOccupation[],
): Promise<{ versionId: string; sessionIds: string[]; preferenceMisses: number }> {
  const supabase = await createClient();

  // Ajout a une version brouillon existante (generation par cycle, en
  // plusieurs passes) : une generation par cycle qui creerait a chaque fois
  // sa propre version obligerait a publier plusieurs fois, et publier
  // ARCHIVE la version publiee precedente (versions.ts) — la seconde passe
  // effacerait la premiere du planning publie. On verifie qu'elle est bien a
  // nous et encore en brouillon avant d'y ecrire.
  let versionId: string;
  if (targetVersionId) {
    const { data: existing } = await supabase
      .from('schedule_versions')
      .select('id, status')
      .eq('school_id', ctx.school.id)
      .eq('academic_year_id', yearId)
      .eq('id', targetVersionId)
      .maybeSingle();
    if (!existing || existing.status !== 'DRAFT') {
      throw new ValidationError('La version ciblée est introuvable ou déjà publiée.');
    }
    versionId = existing.id;
    await supabase.from('schedule_versions').update({ generation_job_id: jobId }).eq('id', versionId);
  } else {
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
        name: `Génération ${number}`,
        status: 'DRAFT',
        source: 'GENERATED',
        generation_job_id: jobId,
        created_by: ctx.user.id,
      })
      .select('id')
      .single();
    if (vErr) throw vErr;
    versionId = version.id;
  }

  // --- salles : ce que le solveur a choisi, puis les souhaits ---------------
  //
  // Le solveur ne connaît que « salle possible » ou « salle impossible ». Une
  // préférence (« de préférence en salle informatique ») se règle donc ici :
  // pour chaque cours qui en exprime une, on tente de le faire basculer dans
  // une salle souhaitée LIBRE à son créneau. Sinon il garde la salle ordinaire
  // que le solveur lui a donnée — l'emploi du temps reste valide dans tous les
  // cas, et le rapport dit combien de souhaits n'ont pas pu être honorés.
  const chosenRoom = new Map<number, string | undefined>();
  const busyByRoom = new Map<string, { start: number; end: number }[]>();
  const occupy = (roomId: string, start: number, end: number) => {
    const list = busyByRoom.get(roomId) ?? [];
    list.push({ start, end });
    busyByRoom.set(roomId, list);
  };
  const release = (roomId: string, start: number, end: number) => {
    const list = busyByRoom.get(roomId) ?? [];
    const i = list.findIndex((w) => w.start === start && w.end === end);
    if (i >= 0) list.splice(i, 1);
  };
  const isFree = (roomId: string, start: number, end: number) =>
    !(busyByRoom.get(roomId) ?? []).some((w) => w.start < end && start < w.end);

  for (const occ of fixedOccupations) {
    if (occ.roomIndex === null || occ.roomIndex === undefined) continue;
    const rid = roomIdByIndex.get(occ.roomIndex);
    if (rid) occupy(rid, occ.startSlot, occ.startSlot + Math.max(1, occ.durationSlots));
  }
  for (const a of solution.assignments) {
    const rid = a.room >= 0 ? roomIdByIndex.get(a.room) : undefined;
    chosenRoom.set(a.taskIndex, rid);
    if (rid) occupy(rid, a.startSlot, a.endSlot);
  }

  let preferenceMisses = 0;
  for (const a of solution.assignments) {
    const meta = taskMeta[a.taskIndex];
    if (!meta || meta.preferredRoomIds.length === 0) continue;
    const current = chosenRoom.get(a.taskIndex);
    if (current && meta.preferredRoomIds.includes(current)) continue;
    const target = meta.preferredRoomIds.find((rid) => isFree(rid, a.startSlot, a.endSlot));
    if (!target) {
      preferenceMisses++;
      continue;
    }
    if (current) release(current, a.startSlot, a.endSlot);
    occupy(target, a.startSlot, a.endSlot);
    chosenRoom.set(a.taskIndex, target);
  }

  // Une seance touche quatre tables. Ecrire ligne par ligne coutait quatre
  // allers-retours par seance : plus de 4 000 requetes pour un lycee, soit
  // plusieurs minutes alors que le solveur, lui, repond en quelques secondes.
  // On fabrique donc les identifiants ici et on ecrit par paquets.
  const sessionIds: string[] = [];
  const sessionRows: TablesInsert<'schedule_sessions'>[] = [];
  const targetRows: TablesInsert<'schedule_session_targets'>[] = [];
  const teacherRows: TablesInsert<'schedule_session_teachers'>[] = [];
  const roomRows: TablesInsert<'schedule_session_rooms'>[] = [];

  for (const a of solution.assignments) {
    const meta = taskMeta[a.taskIndex];
    if (!meta) continue;
    const startSlot = slots[a.startSlot]!;
    const lastSlot = slots[a.endSlot - 1] ?? startSlot;
    const duration = (a.endSlot - a.startSlot) * slotMinutes;
    const sessionId = crypto.randomUUID();
    sessionIds.push(sessionId);

    sessionRows.push({
      id: sessionId,
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
    });

    for (const cid of meta.classIds) {
      targetRows.push({ school_id: ctx.school.id, session_id: sessionId, target_type: 'CLASS', class_id: cid });
    }
    for (const gid of meta.groupIds) {
      targetRows.push({ school_id: ctx.school.id, session_id: sessionId, target_type: 'GROUP', group_id: gid });
    }
    meta.teacherIds.forEach((tid, i) => {
      teacherRows.push({
        school_id: ctx.school.id,
        session_id: sessionId,
        teacher_id: tid,
        role: i === 0 ? 'LEAD' : 'ASSISTANT',
      });
    });
    const roomId = chosenRoom.get(a.taskIndex);
    if (roomId) {
      roomRows.push({ school_id: ctx.school.id, session_id: sessionId, room_id: roomId, is_primary: true });
    }
  }

  // Les seances d'abord : les trois autres tables les referencent.
  await insertInChunks(supabase, 'schedule_sessions', sessionRows);
  await Promise.all([
    insertInChunks(supabase, 'schedule_session_targets', targetRows),
    insertInChunks(supabase, 'schedule_session_teachers', teacherRows),
    insertInChunks(supabase, 'schedule_session_rooms', roomRows),
  ]);

  return { versionId, sessionIds, preferenceMisses };
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
    if (meta) push(`« ${meta.requirement.subjects?.name ?? 'Cours'} — ${targetLabel(meta.requirement)} » : aucun créneau possible.`);
  }
  // CP-SAT a pu désigner les règles elles-mêmes : c'est la réponse la plus
  // utile — on sait quoi assouplir, sans deviner.
  if (solution.blockingRules.length > 0) {
    push(
      solution.blockingRules.length === 1
        ? `Cette règle rend l'emploi du temps impossible : ${solution.blockingRules[0]}. La lever ou l'assouplir suffirait.`
        : `Ces règles sont incompatibles entre elles : ${solution.blockingRules.join(' ; ')}. En lever une suffirait.`,
    );
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
    push('Le solveur n\'a trouvé aucun placement possible. Ajoutez des créneaux, des salles, ou reduisez le nombre de séances.');
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
      problems.push(`Enseignant ${name} : ${need} créneau(x) nécessaires, ${free} seulement disponible(s).`);
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
      problems.push(`Classe ${name} : ${need} créneau(x) nécessaires, la grille n'en compte que ${totalSlots}.`);
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

type GenRoom = { id: string; room_type_id: string | null; capacity: number; features: string[] };

/**
 * Quelles salles conviennent à une exigence ?
 *
 * La capacité minimale et les équipements exigés (paillasses, postes
 * informatiques, machines) filtrent toujours. Ensuite, selon le mode :
 *   - salle ou type IMPOSÉ : rien d'autre n'est accepté ;
 *   - PRÉFÉRÉ : toutes les salles restent possibles, mais on note celles que
 *     l'école souhaite. Après résolution, on essaie d'y déplacer le cours ;
 *     si elles sont prises, ou si l'école n'en a aucune, le cours se tient dans
 *     une salle ordinaire — sans bloquer la génération.
 */
function resolveRooms(r: ReqRow, rooms: GenRoom[]): { roomIds: string[]; preferredIds?: string[]; error?: string } {
  const minCap = r.min_capacity ?? 0;
  const needed = r.required_features ?? [];
  const suits = (x: GenRoom) => x.capacity >= minCap && needed.every((f) => x.features.includes(f));
  const withCap = rooms.filter(suits);

  switch (r.room_requirement_mode) {
    case 'REQUIRED_ROOM': {
      const room = rooms.find((x) => x.id === r.required_room_id);
      if (!room) return { roomIds: [], error: 'la salle imposée est introuvable ou inactive.' };
      return { roomIds: [room.id] };
    }
    case 'REQUIRED_TYPE': {
      const list = withCap.filter((x) => x.room_type_id === r.required_room_type_id).map((x) => x.id);
      if (list.length === 0) {
        return { roomIds: [], error: 'aucune salle du type imposé ne convient (capacité, équipements ?).' };
      }
      return { roomIds: list };
    }
    case 'PREFERRED': {
      const preferred = withCap
        .filter((x) => x.id === r.preferred_room_id || (r.preferred_room_type_id !== null && x.room_type_id === r.preferred_room_type_id))
        .map((x) => x.id);
      return { roomIds: withCap.map((x) => x.id), preferredIds: preferred };
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
  preferred_room_type_id: string | null;
  required_features: string[] | null;
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
  /** Salles souhaitées (mode « de préférence ») : essayées après résolution. */
  preferredRoomIds: string[];
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

// ---------------------------------------------------------------------------
// Variantes
// ---------------------------------------------------------------------------

export type VariantRun = {
  seed: number;
  versionId: string | undefined;
  status: GenerationResult['status'];
  penalty: number;
  penaltyDetails: { label: string; penalty: number }[];
  assignedCount: number;
  taskCount: number;
};

/**
 * Plusieurs emplois du temps valides, à comparer.
 *
 * Toutes les contraintes dures sont respectées dans chacun : ce qui les
 * distingue, c'est le prix payé en préférences. L'école choisit sur pièces au
 * lieu de subir la première solution venue.
 *
 * Chaque variante est une génération complète — trois variantes coûtent trois
 * fois le temps de calcul. C'est pour cela qu'on ne le fait que sur demande.
 *
 * Les variantes s'enchaînent, jamais en parallèle : la base n'autorise qu'une
 * génération à la fois, et c'est une protection qu'on ne contourne pas.
 */
export async function generateVariants(
  ctx: TenantContext,
  yearId: string,
  cycleId: string | undefined,
  count: number,
): Promise<VariantRun[]> {
  const runs: VariantRun[] = [];
  const total = Math.max(1, Math.min(count, 5));

  for (let i = 0; i < total; i++) {
    // Des graines éloignées plutôt que 1, 2, 3 : deux graines voisines donnent
    // souvent le même parcours de recherche, donc la même solution.
    const seed = 42 + i * 1013;
    const result = await generateSchedule(ctx, yearId, cycleId, undefined, seed);
    runs.push({
      seed,
      versionId: result.versionId,
      status: result.status,
      penalty: result.penalty ?? 0,
      penaltyDetails: result.penaltyDetails ?? [],
      assignedCount: result.assignedCount,
      taskCount: result.taskCount,
    });
    // Inutile d'insister si le problème est insoluble : il le restera.
    if (result.status === 'INFEASIBLE') break;
  }

  return runs;
}
