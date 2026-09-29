/**
 * Contrôle d'un déplacement manuel, sans aucun accès à la base.
 *
 * Séparé de `moves.ts` pour être testable : ce module décide si un cours a le
 * droit d'aller quelque part, et une erreur ici déplacerait un cours sur un
 * créneau déjà pris sans rien signaler.
 */

import { detectConflicts, type ValidatorSession } from '@/lib/schedule/validator';
import { blockingRules, type CourseScope } from './apply';

export type SlotChoice = { id: string; dayOfWeek: number; startsAt: string; endsAt: string };

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
): string[] {
  const target = sessions.find((s) => s.id === sessionId);
  if (!target) return ['Séance introuvable.'];

  const after = sessions.map((s) => (s.id === sessionId ? moved(s, slot) : s));
  const reasons = detectConflicts(after)
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

