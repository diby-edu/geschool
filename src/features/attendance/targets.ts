/**
 * Les publics d'un cours : une classe, plusieurs classes réunies (EPS en
 * commun), ou un groupe (LV2, option). L'appel lisait seulement la PREMIÈRE
 * cible, et seulement si c'était une classe : un cours de groupe n'avait
 * personne à appeler, un cours commun n'en montrait qu'une classe.
 */

export type SessionTarget = {
  class_id: string | null;
  group_id: string | null;
  classes: { name: string } | null;
  groups: { name: string } | null;
};

export type CourseAudience = {
  classIds: string[];
  groupIds: string[];
  /** « 6e A », « 6e A + 6e B », « Espagnol 4e ». */
  label: string;
};

/** Champs à demander à PostgREST sous schedule_sessions. */
export const TARGETS_SELECT = 'schedule_session_targets(class_id, group_id, classes(name), groups(name))';

export function audienceOf(targets: readonly SessionTarget[] | null | undefined): CourseAudience {
  const classIds: string[] = [];
  const groupIds: string[] = [];
  const names: string[] = [];
  for (const t of targets ?? []) {
    if (t.class_id && !classIds.includes(t.class_id)) {
      classIds.push(t.class_id);
      if (t.classes?.name) names.push(t.classes.name);
    } else if (t.group_id && !groupIds.includes(t.group_id)) {
      groupIds.push(t.group_id);
      if (t.groups?.name) names.push(t.groups.name);
    }
  }
  return { classIds, groupIds, label: names.length > 0 ? names.join(' + ') : '—' };
}

/** Un élève peut être à la fois dans la classe et dans un groupe du cours : une seule ligne. */
export function uniqueStudents<T extends { studentId: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.studentId)) continue;
    seen.add(r.studentId);
    out.push(r);
  }
  return out;
}

/**
 * Un retard ne peut pas dépasser la durée du cours : au-delà, l'élève a manqué
 * le cours. Toujours au moins une minute (contrainte de la base).
 */
export function clampLateMinutes(minutes: number, startsIso: string, endsIso: string): number {
  const span = Math.round((new Date(endsIso).getTime() - new Date(startsIso).getTime()) / 60000);
  const m = Math.max(1, Math.round(Number.isFinite(minutes) ? minutes : 1));
  return Number.isFinite(span) && span > 0 ? Math.min(m, span) : m;
}
