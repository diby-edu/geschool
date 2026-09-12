import 'server-only';

import { OrToolsSolver } from './ortools';
import type { ScheduleSolver } from './types';

export * from './contract';
export { SolverError, type ScheduleSolver } from './types';

/**
 * Fabrique du solveur. Point d'injection unique : changer d'implementation
 * (additif §57) se fait ici, sans toucher au service de generation.
 */
export function getSolver(): ScheduleSolver {
  return new OrToolsSolver();
}
