/**
 * Interface du solveur (docs/SOLVER_API.md §1).
 *
 * Aucun module metier n'importe une implementation concrete : ils dependent de
 * cette interface. Aujourd'hui une seule implementation existe, `OrToolsSolver`
 * (lot 7) ; d'autres (heuristique locale, service alternatif) pourront s'y
 * substituer sans toucher au code appelant (additif §57).
 */

import type { ScheduleInput, ScheduleSolution, SolverHealth } from './contract';

export interface ScheduleSolver {
  /** Vivacite + versions (OR-Tools, contrat). Sonde avant chaque generation. */
  health(): Promise<SolverHealth>;
  /** Resolution complete. `signal` permet d'annuler cote appelant. */
  solve(input: ScheduleInput, signal?: AbortSignal): Promise<ScheduleSolution>;
  /** Diagnostic d'infaisabilite (noyau + domaines vides), sans objectif. */
  diagnose(input: ScheduleInput, signal?: AbortSignal): Promise<ScheduleSolution>;
}

/** Erreur typee du solveur, traduite en message comprehensible cote UI. */
export class SolverError extends Error {
  readonly kind: 'UNAVAILABLE' | 'UNAUTHORIZED' | 'INVALID_INPUT' | 'CONTRACT_MISMATCH' | 'TIMEOUT' | 'INTERNAL';
  constructor(
    kind: SolverError['kind'],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'SolverError';
    this.kind = kind;
  }
}
