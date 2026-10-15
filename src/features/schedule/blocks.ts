/**
 * Découpage d'un enseignement en COURS sur la semaine (1 cours = 1 heure par
 * créneau). Module pur.
 *
 * Exemples pour 6 h de maths par semaine :
 *   « 1+1+1+1+1+1 » -> 6 cours d'1 h
 *   « 2+2+2 »       -> 3 cours de 2 h
 *   « 4+2 »         -> 1 cours de 4 h et 1 cours de 2 h
 *   « 6 »           -> 1 cours de 6 h d'affilée
 *
 * Chaque nombre est la durée d'un cours, en heures = en créneaux consécutifs
 * de la grille (un cours de 2 h occupe deux créneaux qui se suivent).
 */

export const MAX_BLOCK_HOURS = 8;

/** « 4+2 », « 4 + 2 » -> [4, 2] ; erreur lisible sinon (« 1,5 » refusé : heures entières). */
export function parseBlocks(raw: string): { ok: true; blocks: number[] } | { ok: false; error: string } {
  const parts = raw
    .split(/[+;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'Indiquez le découpage, par exemple 2+2+2 ou 4+2.' };
  const blocks: number[] = [];
  for (const p of parts) {
    const n = Number(p.replace(/h$/i, ''));
    if (!Number.isInteger(n) || n < 1 || n > MAX_BLOCK_HOURS) {
      return { ok: false, error: `« ${p} » : chaque cours dure de 1 à ${MAX_BLOCK_HOURS} heures, en heures entières.` };
    }
    blocks.push(n);
  }
  if (blocks.length > 20) return { ok: false, error: 'Au plus 20 cours par semaine pour un même enseignement.' };
  return { ok: true, blocks };
}

/** [4, 2] -> « 4 h + 2 h » ; [1,1,1] -> « 3 cours d'1 h ». */
export function describeBlocks(blocks: readonly number[]): string {
  if (blocks.length === 0) return '—';
  if (blocks.every((b) => b === blocks[0])) {
    const n = blocks.length;
    const h = blocks[0]!;
    return `${n} cours de ${h} h`;
  }
  return blocks.map((b) => `${b} h`).join(' + ');
}

/** [4, 2] -> « 4+2 » (la saisie). */
export function blocksInput(blocks: readonly number[]): string {
  return blocks.join('+');
}

/** Heures (créneaux) d'une durée enregistrée en minutes : 55 -> 1, 110 -> 2, 120 -> 2, 360 -> 6. */
export function hoursOf(minutes: number): number {
  return Math.max(1, Math.round(minutes / 60));
}

export type RequirementShape = {
  blockHours: readonly number[] | null;
  sessionsCount: number;
  sessionDurationMinutes: number | null;
  weeklyMinutes: number;
};

/**
 * Les cours de la semaine pour un enseignement, en heures (= créneaux).
 * Un découpage explicite l'emporte ; sinon « N séances de D », regroupées si
 * l'école a une règle « Grouper les séances par blocs de K ».
 */
export function coursePlan(r: RequirementShape, groupBy = 1): number[] {
  if (r.blockHours && r.blockHours.length > 0) return [...r.blockHours];
  const each = hoursOf(r.sessionDurationMinutes ?? Math.round(r.weeklyMinutes / Math.max(1, r.sessionsCount)));
  const size = Math.max(1, groupBy);
  const whole = size > 1 ? Math.floor(r.sessionsCount / size) : 0;
  const leftover = r.sessionsCount - whole * size;
  return [...Array.from({ length: whole }, () => size * each), ...Array.from({ length: leftover }, () => each)];
}

/** Total d'heures par semaine d'un découpage. */
export function totalHours(blocks: readonly number[]): number {
  return blocks.reduce((a, b) => a + b, 0);
}
