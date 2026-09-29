/**
 * Ce que l'enregistrement du programme d'un niveau doit VRAIMENT écrire.
 *
 * L'écran renvoie toutes les matières de l'ordre, cochées ou non. On ne réécrit
 * pas tout : une ligne inchangée n'est pas touchée (sinon chaque enregistrement
 * ferait mentir `updated_at` et l'historique), une ligne décochée est retirée,
 * une ligne cochée est ajoutée ou corrigée.
 *
 * Logique isolée de la base pour être testable telle quelle.
 */

export type ProgrammeRow = {
  subjectId: string;
  /** Case cochée : la matière est au programme de ce niveau. */
  included: boolean;
  coefficient: number;
  weeklyMinutes: number;
  /** Faux = matière facultative (« Fac. » dans l'écran). */
  mandatory: boolean;
};

export type ExistingEntry = {
  id: string;
  subjectId: string;
  coefficient: number;
  weeklyMinutes: number;
  mandatory: boolean;
};

export type ProgrammePlan = {
  upsert: { subjectId: string; coefficient: number; weeklyMinutes: number; mandatory: boolean }[];
  removeIds: string[];
  /** Parmi les `upsert`, celles qui n'étaient pas encore au programme. */
  added: number;
};

export function planProgramme(existing: ExistingEntry[], rows: ProgrammeRow[]): ProgrammePlan {
  const bySubject = new Map(existing.map((e) => [e.subjectId, e]));
  const plan: ProgrammePlan = { upsert: [], removeIds: [], added: 0 };
  const seen = new Set<string>();

  for (const row of rows) {
    // Une matière envoyée deux fois ne compte qu'une : la première gagne.
    if (seen.has(row.subjectId)) continue;
    seen.add(row.subjectId);

    const found = bySubject.get(row.subjectId);
    if (!row.included) {
      if (found) plan.removeIds.push(found.id);
      continue;
    }
    const unchanged =
      found &&
      found.coefficient === row.coefficient &&
      found.weeklyMinutes === row.weeklyMinutes &&
      found.mandatory === row.mandatory;
    if (unchanged) continue;

    if (!found) plan.added += 1;
    plan.upsert.push({
      subjectId: row.subjectId,
      coefficient: row.coefficient,
      weeklyMinutes: row.weeklyMinutes,
      mandatory: row.mandatory,
    });
  }

  return plan;
}

/** Le bilan affiché après l'enregistrement. */
export function planCounts(plan: ProgrammePlan): { added: number; changed: number; removed: number } {
  return { added: plan.added, changed: plan.upsert.length - plan.added, removed: plan.removeIds.length };
}
