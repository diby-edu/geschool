import 'server-only';

import { serverEnv } from '@/lib/env';
import {
  CONTRACT_VERSION,
  scheduleInputSchema,
  scheduleSolutionSchema,
  solverHealthSchema,
  type ScheduleInput,
  type ScheduleSolution,
  type SolverHealth,
} from './contract';
import { SolverError, type ScheduleSolver } from './types';

/**
 * Client HTTP du service `solver-service` (docs/SOLVER_API.md §2).
 *
 * - transport JSON UTF-8, en-tete `X-Solver-Secret` (secret partage),
 *   en-tete `X-Request-Id` pour la correlation des journaux ;
 * - le delai HTTP vaut `timeoutSeconds + 30 s` : on laisse le solveur atteindre
 *   sa propre limite avant de couper ;
 * - la reponse est revalidee par Zod : l'application ne fait pas confiance au
 *   service, meme prive.
 */
export class OrToolsSolver implements ScheduleSolver {
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(baseUrl?: string, secret?: string) {
    const env = serverEnv();
    this.baseUrl = (baseUrl ?? env.SOLVER_SERVICE_URL).replace(/\/+$/, '');
    this.secret = secret ?? env.SOLVER_SHARED_SECRET;
  }

  async health(): Promise<SolverHealth> {
    const res = await this.fetch('/health', 'GET', undefined, AbortSignal.timeout(5000));
    const body = await this.json(res);
    return solverHealthSchema.parse(body);
  }

  async solve(input: ScheduleInput, signal?: AbortSignal): Promise<ScheduleSolution> {
    return this.post('/solve', input, signal);
  }

  async diagnose(input: ScheduleInput, signal?: AbortSignal): Promise<ScheduleSolution> {
    return this.post('/diagnose', input, signal);
  }

  private async post(path: string, input: ScheduleInput, signal?: AbortSignal): Promise<ScheduleSolution> {
    const payload = scheduleInputSchema.parse(input); // valide AVANT l'envoi
    const httpTimeoutMs = (payload.timeoutSeconds + 30) * 1000;
    const signals = [AbortSignal.timeout(httpTimeoutMs)];
    if (signal) signals.push(signal);

    const res = await this.fetch(path, 'POST', payload, AbortSignal.any(signals), payload.requestId);
    const body = await this.json(res);
    const solution = scheduleSolutionSchema.parse(body);

    if (solution.contractVersion !== CONTRACT_VERSION) {
      throw new SolverError(
        'CONTRACT_MISMATCH',
        `Version de contrat incompatible : attendu ${CONTRACT_VERSION}, recu ${solution.contractVersion}.`,
      );
    }
    return solution;
  }

  private async fetch(
    path: string,
    method: 'GET' | 'POST',
    body: unknown,
    signal: AbortSignal,
    requestId?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.secret) headers['x-solver-secret'] = this.secret;
    if (requestId) headers['x-request-id'] = requestId;
    if (body !== undefined) headers['content-type'] = 'application/json';

    const init: RequestInit = { method, headers, signal, cache: 'no-store' };
    if (body !== undefined) init.body = JSON.stringify(body);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'TimeoutError') {
        throw new SolverError('TIMEOUT', 'Le solveur a depasse le delai imparti.', { cause });
      }
      throw new SolverError('UNAVAILABLE', "Le service de generation est injoignable.", { cause });
    }

    if (res.ok) return res;
    throw this.mapError(res.status);
  }

  private mapError(status: number): SolverError {
    switch (status) {
      case 401:
        return new SolverError('UNAUTHORIZED', "Authentification du solveur refusee.");
      case 409:
        return new SolverError('CONTRACT_MISMATCH', 'Version de contrat incompatible.');
      case 413:
        return new SolverError('INVALID_INPUT', 'Le probleme envoye est trop volumineux.');
      case 422:
        return new SolverError('INVALID_INPUT', "Le probleme envoye ne respecte pas le contrat.");
      case 504:
        return new SolverError('TIMEOUT', 'Le solveur a depasse le delai imparti.');
      default:
        return new SolverError('INTERNAL', `Le solveur a repondu une erreur (${status}).`);
    }
  }

  private async json(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch (cause) {
      throw new SolverError('INTERNAL', 'Reponse illisible du solveur.', { cause });
    }
  }
}
