import { loadavg, cpus } from 'node:os';

/**
 * Garde-fou de charge systeme (ADR-014).
 *
 * Le VPS n'a qu'un seul vCPU et heberge huit sites en production. Une
 * generation d'emploi du temps sature ce cœur pendant plusieurs minutes.
 * Plutot que de la lancer quoi qu'il arrive, le worker consulte d'abord la
 * charge : si la machine travaille deja, le job est DIFFERE.
 *
 * Les sites en production passent avant le confort d'une generation.
 */

export type LoadDecision =
  | { defer: false; loadAverage: number; perCore: number }
  | { defer: true; loadAverage: number; perCore: number; retryAfterSeconds: number };

/** Charge moyenne sur 1 minute. Vaut 0 sur Windows, ou l'OS ne la fournit pas. */
export function oneMinuteLoad(): number {
  const [one] = loadavg();
  return one ?? 0;
}

export function coreCount(): number {
  return Math.max(1, cpus().length);
}

/**
 * @param threshold        charge par cœur au-dela de laquelle on differe.
 *                         0 desactive le garde-fou.
 * @param retryAfterSeconds delai de report.
 */
export function evaluateLoad(
  threshold: number,
  retryAfterSeconds: number,
  now: { load: number; cores: number } = { load: oneMinuteLoad(), cores: coreCount() },
): LoadDecision {
  const perCore = now.cores > 0 ? now.load / now.cores : now.load;

  // Windows ne rapporte pas de charge : loadavg() y renvoie 0. Un 0 strict est
  // donc ambigu — machine au repos, ou information indisponible. Dans les deux
  // cas, ne pas differer est le bon comportement.
  if (threshold <= 0 || now.load === 0) {
    return { defer: false, loadAverage: now.load, perCore };
  }

  if (perCore >= threshold) {
    return { defer: true, loadAverage: now.load, perCore, retryAfterSeconds };
  }

  return { defer: false, loadAverage: now.load, perCore };
}
