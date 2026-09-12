import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSION,
  scheduleInputSchema,
  scheduleSolutionSchema,
  solverHealthSchema,
} from './contract';

/**
 * Le contrat solveur est la frontiere de confiance : ces tests garantissent que
 * la validation Zod applique les valeurs par defaut, rejette les entrees hors
 * contrat, et lit une reponse au format du service Python (camelCase) sans
 * perdre de champ (docs/SOLVER_API.md §9).
 */
describe('scheduleInputSchema', () => {
  it('applique les valeurs par defaut sur une tache minimale', () => {
    const parsed = scheduleInputSchema.parse({
      requestId: 'r1',
      slotCount: 10,
      tasks: [{ index: 0, candidateStartSlots: [0, 1], teacherIndexes: [0], classIndexes: [0] }],
    });
    expect(parsed.contractVersion).toBe(CONTRACT_VERSION);
    expect(parsed.timeoutSeconds).toBe(30);
    expect(parsed.workers).toBe(1);
    expect(parsed.tasks[0]!.durationSlots).toBe(1);
    expect(parsed.tasks[0]!.locked).toBe(false);
    expect(parsed.tasks[0]!.candidateRooms).toEqual([]);
  });

  it('accepte la carte groupe -> classes (plusieurs classes par groupe)', () => {
    const parsed = scheduleInputSchema.parse({
      requestId: 'r1',
      slotCount: 5,
      groupParentClasses: { '0': [0, 1] },
      tasks: [{ index: 0, candidateStartSlots: [0], groupIndexes: [0] }],
    });
    expect(parsed.groupParentClasses['0']).toEqual([0, 1]);
  });

  it('rejette un slotCount non positif', () => {
    expect(() => scheduleInputSchema.parse({ requestId: 'r', slotCount: 0, tasks: [] })).toThrow();
  });
});

describe('scheduleSolutionSchema', () => {
  it('lit une solution au format Python (camelCase)', () => {
    const solution = scheduleSolutionSchema.parse({
      contractVersion: '1.0.0',
      requestId: 'r1',
      status: 'OPTIMAL',
      assignments: [{ taskIndex: 0, startSlot: 3, endSlot: 5, room: 2 }],
      emptyDomainTasks: [],
      infeasibleCore: [],
      statistics: { variables: 10, constraints: 4, branches: 12, conflicts: 0, wallTimeMs: 8, solutionsFound: 1 },
    });
    expect(solution.status).toBe('OPTIMAL');
    expect(solution.assignments[0]).toMatchObject({ taskIndex: 0, startSlot: 3, endSlot: 5, room: 2 });
    expect(solution.statistics.wallTimeMs).toBe(8);
  });

  it('complete statistiques et listes manquantes', () => {
    const solution = scheduleSolutionSchema.parse({
      contractVersion: '1.0.0',
      requestId: 'r1',
      status: 'INFEASIBLE',
    });
    expect(solution.assignments).toEqual([]);
    expect(solution.emptyDomainTasks).toEqual([]);
    expect(solution.statistics.variables).toBe(0);
  });

  it('rejette un statut inconnu', () => {
    expect(() =>
      scheduleSolutionSchema.parse({ contractVersion: '1.0.0', requestId: 'r', status: 'BOGUS' }),
    ).toThrow();
  });
});

describe('solverHealthSchema', () => {
  it('lit la reponse /health', () => {
    const health = solverHealthSchema.parse({
      status: 'ok',
      contractVersion: '1.0.0',
      ortoolsVersion: '9.11.4210',
      pythonVersion: '3.12.10',
      maxWorkers: 1,
    });
    expect(health.ortoolsVersion).toBe('9.11.4210');
  });
});
