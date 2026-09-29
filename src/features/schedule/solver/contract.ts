/**
 * Contrat solveur TypeScript (docs/SOLVER_API.md).
 *
 * Miroir Zod du contrat Pydantic du service Python. Les deux cotes valident
 * independamment : l'application ne fait pas confiance a la reponse du solveur,
 * et le solveur ne fait pas confiance a l'envoi (additif §5).
 *
 * Aucune donnee identifiante ne franchit cette frontiere : uniquement des
 * INDICES compacts. La table de correspondance indice <-> uuid reste dans
 * l'application (docs/SOLVER_API.md §3).
 */

import { z } from 'zod';

export const CONTRACT_VERSION = '1.0.0';

const intArray = z.array(z.number().int().nonnegative());

export const taskSchema = z.object({
  index: z.number().int().nonnegative(),
  durationSlots: z.number().int().min(1).default(1),
  candidateStartSlots: intArray.default([]),
  candidateRooms: intArray.default([]),
  teacherIndexes: intArray.default([]),
  classIndexes: intArray.default([]),
  groupIndexes: intArray.default([]),
  locked: z.boolean().default(false),
  fixedStartSlot: z.number().int().nonnegative().nullable().default(null),
  fixedRoom: z.number().int().nonnegative().nullable().default(null),
  priority: z.number().int().default(100),
  label: z.string().default(''),
});

export const fixedOccupationSchema = z.object({
  startSlot: z.number().int().nonnegative(),
  durationSlots: z.number().int().min(1).default(1),
  teacherIndexes: intArray.default([]),
  classIndexes: intArray.default([]),
  groupIndexes: intArray.default([]),
  roomIndex: z.number().int().nonnegative().nullable().default(null),
});

/**
 * Plafond de charge sur un ensemble de tâches : « pas plus de N par jour »,
 * « pas plus de N d'affilée ». Contrairement aux moments interdits, ces règles
 * portent sur plusieurs séances à la fois et ne peuvent donc pas se traduire
 * par un retrait de créneaux : elles vivent dans le modèle du solveur.
 */
export const loadLimitSchema = z.object({
  taskIndexes: intArray.default([]),
  maxPerDay: z.number().int().min(0).nullable().default(null),
  maxConsecutive: z.number().int().min(1).nullable().default(null),
  /** `null` = plafond dur. Un entier = plafond souple : le dépassement coûte ce poids. */
  weight: z.number().int().min(1).nullable().default(null),
  label: z.string().default(''),
});

/** Créneaux de départ déconseillés : « plutôt le matin », « jamais en dernière heure ». */
export const slotPenaltySchema = z.object({
  taskIndexes: intArray.default([]),
  slots: intArray.default([]),
  weight: z.number().int().min(1).default(1),
  label: z.string().default(''),
});

/** Trous dans la journée d'une classe ou d'un enseignant. */
export const gapPenaltySchema = z.object({
  taskIndexes: intArray.default([]),
  weight: z.number().int().min(1).default(1),
  label: z.string().default(''),
});

export const scheduleInputSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION).default(CONTRACT_VERSION),
  requestId: z.string().min(1),
  slotCount: z.number().int().positive(),
  roomCount: z.number().int().nonnegative().default(0),
  // groupe -> classes parentes ; cles chaines (compatibles JSON). Un groupe peut
  // appartenir a plusieurs classes (§16).
  groupParentClasses: z.record(z.string(), z.array(z.number().int().nonnegative())).default({}),
  timeoutSeconds: z.number().int().min(1).max(900).default(30),
  workers: z.number().int().min(1).max(8).default(1),
  randomSeed: z.number().int().default(42),
  /** Créneaux de chaque journée, dans l'ordre : sans eux, pas de plafond par jour. */
  days: z.array(intArray).default([]),
  loadLimits: z.array(loadLimitSchema).default([]),
  slotPenalties: z.array(slotPenaltySchema).default([]),
  gapPenalties: z.array(gapPenaltySchema).default([]),
  tasks: z.array(taskSchema).default([]),
  fixedOccupations: z.array(fixedOccupationSchema).default([]),
});

export const assignmentSchema = z.object({
  taskIndex: z.number().int().nonnegative(),
  startSlot: z.number().int().nonnegative(),
  endSlot: z.number().int().nonnegative(),
  room: z.number().int(),
});

export const solveStatisticsSchema = z.object({
  variables: z.number().int().default(0),
  constraints: z.number().int().default(0),
  branches: z.number().int().default(0),
  conflicts: z.number().int().default(0),
  wallTimeMs: z.number().int().default(0),
  solutionsFound: z.number().int().default(0),
});

export const solverStatus = z.enum(['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'TIME_LIMIT', 'UNKNOWN']);

const EMPTY_STATS = { variables: 0, constraints: 0, branches: 0, conflicts: 0, wallTimeMs: 0, solutionsFound: 0 };

/** Ce qu'une préférence a coûté dans la solution retenue. */
export const penaltyDetailSchema = z.object({
  label: z.string(),
  penalty: z.number().int(),
});

export const scheduleSolutionSchema = z.object({
  contractVersion: z.string(),
  requestId: z.string(),
  status: solverStatus,
  assignments: z.array(assignmentSchema).default([]),
  emptyDomainTasks: intArray.default([]),
  infeasibleCore: intArray.default([]),
  /** Règles dures qui, à elles seules, rendent le problème insoluble. */
  blockingRules: z.array(z.string()).default([]),
  /** Somme pondérée des préférences non satisfaites. 0 = tout est respecté. */
  penalty: z.number().int().default(0),
  penaltyDetails: z.array(penaltyDetailSchema).default([]),
  statistics: solveStatisticsSchema.default(EMPTY_STATS),
});

export const solverHealthSchema = z.object({
  status: z.string(),
  contractVersion: z.string(),
  ortoolsVersion: z.string(),
  pythonVersion: z.string().optional(),
  maxWorkers: z.number().int().optional(),
});

export type SolverTask = z.infer<typeof taskSchema>;
export type LoadLimit = z.infer<typeof loadLimitSchema>;
export type SlotPenalty = z.infer<typeof slotPenaltySchema>;
export type GapPenalty = z.infer<typeof gapPenaltySchema>;
export type PenaltyDetail = z.infer<typeof penaltyDetailSchema>;
export type FixedOccupation = z.infer<typeof fixedOccupationSchema>;
export type ScheduleInput = z.input<typeof scheduleInputSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type ScheduleSolution = z.infer<typeof scheduleSolutionSchema>;
export type SolverStatus = z.infer<typeof solverStatus>;
export type SolverHealth = z.infer<typeof solverHealthSchema>;
