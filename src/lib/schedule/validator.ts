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
 * seance d'un de ses groupes ne le peuvent pas. Le recouvrement groupe/classe
 * est fourni par `groupClassMap` (group_id -> class_id).
 */

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
function effectiveClasses(s: ValidatorSession, groupClassMap: Map<string, string>): Set<string> {
  const set = new Set(s.classIds);
  for (const g of s.groupIds) {
    const c = groupClassMap.get(g);
    if (c) set.add(c);
  }
  return set;
}

function shared<T>(a: Iterable<T>, b: Set<T>): T | null {
  for (const x of a) if (b.has(x)) return x;
  return null;
}

/**
 * Detecte tous les conflits durs d'un ensemble de seances.
 *
 * @param groupClassMap group_id -> class_id, pour le recouvrement groupe/classe.
 *   Une seance de classe entiere et une seance d'un groupe de cette classe
 *   entrent en conflit (les eleves du groupe sont dans la classe).
 */
export function detectConflicts(
  sessions: ValidatorSession[],
  groupClassMap: Map<string, string> = new Map(),
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i]!;
      const b = sessions[j]!;
      if (!overlaps(a, b)) continue;

      // Enseignant
      const t = shared(a.teacherIds, new Set(b.teacherIds));
      if (t) {
        conflicts.push(conflict('TEACHER', a, b, t, `Enseignant en double : « ${a.label} » et « ${b.label} » au meme moment.`));
      }

      // Salle
      const r = shared(a.roomIds, new Set(b.roomIds));
      if (r) {
        conflicts.push(conflict('ROOM', a, b, r, `Salle occupee : « ${a.label} » et « ${b.label} » utilisent la meme salle au meme moment.`));
      }

      // Groupe strict (meme group_id)
      const g = shared(a.groupIds, new Set(b.groupIds));
      if (g) {
        conflicts.push(conflict('GROUP', a, b, g, `Groupe en double : « ${a.label} » et « ${b.label} » au meme moment.`));
      }

      // Conflit de classe : il ne nait QUE si l'un des deux cours vise la
      // classe ENTIERE (classIds) et que l'autre occupe cette meme classe,
      // directement ou via un de ses groupes. Deux groupes distincts d'une
      // meme classe (langues) ne se genent pas : eleves differents.
      const effA = effectiveClasses(a, groupClassMap);
      const effB = effectiveClasses(b, groupClassMap);
      const cA = shared(a.classIds, effB); // classe entiere de A occupee par B
      const cB = shared(b.classIds, effA); // classe entiere de B occupee par A
      const c = cA ?? cB;
      if (c && !g) {
        conflicts.push(conflict('CLASS', a, b, c, `Classe en double : « ${a.label} » et « ${b.label} » au meme moment.`));
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
  groupClassMap?: Map<string, string>,
): ScheduleConflict[] {
  return detectConflicts([candidate, ...existing], groupClassMap).filter(
    (c) => c.aId === candidate.id || c.bId === candidate.id,
  );
}
