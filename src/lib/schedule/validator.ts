/**
 * Validateur d'emploi du temps — INDEPENDANT (docs/SCHEDULE_ENGINE.md §9).
 *
 * Fonction pure : detecte les conflits entre seances, sans base ni framework.
 * C'est la source de verite des contraintes dures ; l'editeur manuel (lot 6) et
 * le validateur post-solveur (lot 7) l'appellent tous deux, garantissant qu'ils
 * concluent identiquement.
 *
 * Deux seances se chevauchent quand elles sont le meme jour et que leurs plages
 * horaires se recouvrent. En cas de chevauchement, un conflit DUR nait si elles
 * partagent une ressource : un enseignant, une classe, un groupe, ou une salle.
 *
 * Cas des groupes (§6 du moteur) : deux groupes d'une meme classe peuvent avoir
 * cours en meme temps (langues) ; mais une seance de la classe entiere et une
 * seance d'un de ses groupes ne le peuvent pas. Un groupe peut reunir
 * PLUSIEURS classes (§16) : toutes comptent.
 *
 * Deux groupes DIFFERENTS qui ont au moins un eleve en commun (Espagnol et
 * option Latin) ne peuvent pas non plus avoir cours en meme temps : l'eleve ne
 * peut pas etre a deux endroits. Le contexte des groupes fournit leurs
 * classes et leurs eleves.
 */

/** Ce que l'on sait des groupes : leurs classes, et leurs eleves. */
export type GroupContext = {
  classesOf: ReadonlyMap<string, readonly string[]>;
  studentsOf?: ReadonlyMap<string, ReadonlySet<string>>;
};

const EMPTY_GROUPS: GroupContext = { classesOf: new Map() };

/** Accepte l'ancienne forme (group_id -> une classe) ou le contexte complet. */
function toGroupContext(groups: GroupContext | ReadonlyMap<string, string> | undefined): GroupContext {
  if (!groups) return EMPTY_GROUPS;
  if ('classesOf' in groups) return groups as GroupContext;
  const classesOf = new Map<string, string[]>();
  for (const [g, c] of groups as ReadonlyMap<string, string>) classesOf.set(g, [c]);
  return { classesOf };
}

export type ValidatorSession = {
  id: string;
  label: string; // pour les messages : « Maths 4e1 »
  dayOfWeek: number; // 1..7 ISO
  startMin: number; // minutes depuis minuit
  endMin: number;
  teacherIds: string[];
  classIds: string[];
  groupIds: string[];
  roomIds: string[];
  /** Salles qui reçoivent plusieurs classes à la fois (terrain) : jamais en conflit. */
  sharedRoomIds?: string[];
};

export type ConflictKind = 'TEACHER' | 'CLASS' | 'GROUP' | 'ROOM';

export type ScheduleConflict = {
  kind: ConflictKind;
  severity: 'HARD';
  aId: string;
  bId: string;
  message: string;
  resourceId: string;
};

/** Deux plages du meme jour se recouvrent-elles ? */
function overlaps(a: ValidatorSession, b: ValidatorSession): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.startMin < b.endMin && b.startMin < a.endMin;
}

/** Classes effectivement occupees par une seance (cibles directes + classes des groupes). */
function effectiveClasses(s: ValidatorSession, groups: GroupContext): Set<string> {
  const set = new Set(s.classIds);
  for (const g of s.groupIds) {
    for (const c of groups.classesOf.get(g) ?? []) set.add(c);
  }
  return set;
}

/** Un eleve commun a un groupe de A et a un AUTRE groupe de B ? Renvoie le couple. */
function sharedStudentGroups(a: ValidatorSession, b: ValidatorSession, groups: GroupContext): [string, string] | null {
  const studentsOf = groups.studentsOf;
  if (!studentsOf) return null;
  for (const ga of a.groupIds) {
    const sa = studentsOf.get(ga);
    if (!sa || sa.size === 0) continue;
    for (const gb of b.groupIds) {
      if (gb === ga) continue;
      const sb = studentsOf.get(gb);
      if (!sb || sb.size === 0) continue;
      const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
      for (const st of small) if (big.has(st)) return [ga, gb];
    }
  }
  return null;
}

/** Les salles qu'une seule classe peut occuper à la fois. */
function exclusiveRooms(s: ValidatorSession): string[] {
  return s.sharedRoomIds?.length ? s.roomIds.filter((r) => !s.sharedRoomIds!.includes(r)) : s.roomIds;
}

function shared<T>(a: Iterable<T>, b: Set<T>): T | null {
  for (const x of a) if (b.has(x)) return x;
  return null;
}

/**
 * Detecte tous les conflits durs d'un ensemble de seances.
 *
 * @param groupsInput les classes et les eleves de chaque groupe. Une seance de
 *   classe entiere et une seance d'un groupe de cette classe entrent en
 *   conflit ; deux groupes qui partagent un eleve aussi.
 */
export function detectConflicts(
  sessions: ValidatorSession[],
  groupsInput?: GroupContext | ReadonlyMap<string, string>,
): ScheduleConflict[] {
  const groups = toGroupContext(groupsInput);
  const conflicts: ScheduleConflict[] = [];

  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i]!;
      const b = sessions[j]!;
      if (!overlaps(a, b)) continue;

      // Enseignant
      const t = shared(a.teacherIds, new Set(b.teacherIds));
      if (t) {
        conflicts.push(conflict('TEACHER', a, b, t, `Enseignant en double : « ${a.label} » et « ${b.label} » au même moment.`));
      }

      // Salle
      const r = shared(exclusiveRooms(a), new Set(exclusiveRooms(b)));
      if (r) {
        conflicts.push(conflict('ROOM', a, b, r, `Salle occupee : « ${a.label} » et « ${b.label} » utilisent la même salle au même moment.`));
      }

      // Groupe strict (meme group_id)
      const g = shared(a.groupIds, new Set(b.groupIds));
      if (g) {
        conflicts.push(conflict('GROUP', a, b, g, `Groupe en double : « ${a.label} » et « ${b.label} » au même moment.`));
      }

      // Conflit de classe : il ne nait QUE si l'un des deux cours vise la
      // classe ENTIERE (classIds) et que l'autre occupe cette meme classe,
      // directement ou via un de ses groupes. Deux groupes distincts d'une
      // meme classe (langues) ne se genent pas : eleves differents.
      const effA = effectiveClasses(a, groups);
      const effB = effectiveClasses(b, groups);
      const cA = shared(a.classIds, effB); // classe entiere de A occupee par B
      const cB = shared(b.classIds, effA); // classe entiere de B occupee par A
      const c = cA ?? cB;
      if (c && !g) {
        conflicts.push(conflict('CLASS', a, b, c, `Classe en double : « ${a.label} » et « ${b.label} » au même moment.`));
      }

      // Deux groupes differents qui ont des eleves en commun.
      if (!g && !c) {
        const pair = sharedStudentGroups(a, b, groups);
        if (pair) {
          conflicts.push(
            conflict('GROUP', a, b, pair[0], `Élèves en double : « ${a.label} » et « ${b.label} » ont des élèves en commun, au même moment.`),
          );
        }
      }
    }
  }

  return conflicts;
}

function conflict(
  kind: ConflictKind,
  a: ValidatorSession,
  b: ValidatorSession,
  resourceId: string,
  message: string,
): ScheduleConflict {
  return { kind, severity: 'HARD', aId: a.id, bId: b.id, resourceId, message };
}

/** Conflits impliquant une seance donnee (pour valider un ajout/deplacement). */
export function conflictsFor(
  candidate: ValidatorSession,
  existing: ValidatorSession[],
  groups?: GroupContext | ReadonlyMap<string, string>,
): ScheduleConflict[] {
  return detectConflicts([candidate, ...existing], groups).filter(
    (c) => c.aId === candidate.id || c.bId === candidate.id,
  );
}

/**
 * Couples de groupes qui partagent au moins un élève (pour le solveur : il ne
 * doit pas les placer à la même heure).
 */
export function overlappingGroupPairs(context: GroupContext): [string, string][] {
  const studentsOf = context.studentsOf;
  if (!studentsOf) return [];
  const groups = [...studentsOf.entries()].filter(([, s]) => s.size > 0);
  const pairs: [string, string][] = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const [ga, sa] = groups[i]!;
      const [gb, sb] = groups[j]!;
      const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
      for (const st of small) {
        if (big.has(st)) {
          pairs.push([ga, gb]);
          break;
        }
      }
    }
  }
  return pairs;
}
