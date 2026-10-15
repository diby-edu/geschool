/**
 * Contrôle d'un déplacement manuel, sans aucun accès à la base.
 *
 * Séparé de `moves.ts` pour être testable : ce module décide si un cours a le
 * droit d'aller quelque part, et une erreur ici déplacerait un cours sur un
 * créneau déjà pris sans rien signaler.
 */

import { detectConflicts, type GroupContext, type ValidatorSession } from '@/lib/schedule/validator';
import { blockingRules, type CourseScope } from './apply';

/**
 * Un départ possible pour le cours. Un cours de plusieurs créneaux (2 h de
 * maths) occupe un BLOC : `id` est son premier créneau, `endId` le dernier,
 * et `startsAt`/`endsAt` couvrent tout le bloc.
 */
export type SlotChoice = { id: string; endId?: string; dayOfWeek: number; startsAt: string; endsAt: string };

/**
 * Les blocs de `length` créneaux consécutifs d'une grille, jour par jour —
 * la même règle que le générateur : des créneaux de cours qui se suivent dans
 * la journée. Un bloc qui déborderait de la journée n'est pas proposé.
 */
export function blocksOf(slots: readonly SlotChoice[], length: number): SlotChoice[] {
  const n = Math.max(1, length);
  const byDay = new Map<number, SlotChoice[]>();
  for (const s of slots) {
    const list = byDay.get(s.dayOfWeek) ?? [];
    list.push(s);
    byDay.set(s.dayOfWeek, list);
  }
  const blocks: SlotChoice[] = [];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    const list = byDay.get(day)!;
    for (let i = 0; i + n <= list.length; i++) {
      const first = list[i]!;
      const last = list[i + n - 1]!;
      blocks.push({ id: first.id, endId: last.id, dayOfWeek: day, startsAt: first.startsAt, endsAt: last.endsAt });
    }
  }
  return blocks;
}

/** Combien de créneaux le cours occupe, de son premier à son dernier (au moins 1). */
export function spanOf(slots: readonly SlotChoice[], startId: string, endId: string | null): number {
  const start = slots.find((s) => s.id === startId);
  if (!start) return 1;
  const day = slots.filter((s) => s.dayOfWeek === start.dayOfWeek);
  const a = day.findIndex((s) => s.id === startId);
  const b = endId ? day.findIndex((s) => s.id === endId) : a;
  return b >= a ? b - a + 1 : 1;
}

export type MoveVerdict =
  | { ok: true }
  | { ok: false; reasons: string[] };

const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** La séance telle qu'elle serait après déplacement. */
function moved(session: ValidatorSession, slot: SlotChoice): ValidatorSession {
  return { ...session, dayOfWeek: slot.dayOfWeek, startMin: toMin(slot.startsAt), endMin: toMin(slot.endsAt) };
}

/**
 * Ce qui empêche ce cours d'aller sur ce créneau : conflits de ressource, et
 * règles de l'école. Liste vide = le déplacement est possible.
 */
export function moveProblems(
  sessions: ValidatorSession[],
  sessionId: string,
  slot: SlotChoice,
  scope: CourseScope | null,
  rules: Parameters<typeof blockingRules>[0],
  groups?: GroupContext,
): string[] {
  const target = sessions.find((s) => s.id === sessionId);
  if (!target) return ['Séance introuvable.'];

  const after = sessions.map((s) => (s.id === sessionId ? moved(s, slot) : s));
  const reasons = detectConflicts(after, groups)
    .filter((c) => c.aId === sessionId || c.bId === sessionId)
    .map((c) => c.message);

  if (scope) {
    const window = { day: slot.dayOfWeek, startMin: toMin(slot.startsAt), endMin: toMin(slot.endsAt) };
    for (const rule of blockingRules(rules, scope, window)) {
      reasons.push(`Votre règle « ${rule.summary} » l’interdit.`);
    }
  }

  return [...new Set(reasons)];
}

