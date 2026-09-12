import { z } from 'zod';

/**
 * Notation (docs/DATABASE.md §21-22). Aucune règle pédagogique n'est codée en
 * dur : barème, coefficients, types d'évaluation et arrondis sont tous
 * configurables par établissement.
 */

export const ROUNDING_MODES = ['NONE', 'HALF_UP', 'NEAREST_HALF', 'NEAREST_QUARTER', 'FLOOR', 'CEIL'] as const;

export const gradingScaleSchema = z
  .object({
    code: z.string().trim().min(1, 'Code requis.').max(30),
    name: z.string().trim().min(1, 'Nom requis.').max(120),
    kind: z.enum(['NUMERIC', 'LETTER']),
    minScore: z.coerce.number().min(0).max(1000),
    maxScore: z.coerce.number().min(1).max(1000),
    passingScore: z.coerce.number().min(0).max(1000),
    decimals: z.coerce.number().int().min(0).max(4),
    rounding: z.enum(ROUNDING_MODES),
    isDefault: z.coerce.boolean().default(false),
  })
  .refine((v) => v.maxScore > v.minScore, { message: 'Le maximum doit dépasser le minimum.', path: ['maxScore'] })
  .refine((v) => v.passingScore >= v.minScore && v.passingScore <= v.maxScore, {
    message: 'Le seuil de réussite doit être dans l’intervalle.',
    path: ['passingScore'],
  });

export type GradingScaleInput = z.infer<typeof gradingScaleSchema>;

export const assessmentTypeSchema = z.object({
  code: z.string().trim().min(1, 'Code requis.').max(30),
  name: z.string().trim().min(1, 'Nom requis.').max(120),
  defaultCoefficient: z.coerce.number().min(0.01, 'Coefficient positif requis.').max(100),
  countsInAverage: z.coerce.boolean().default(true),
  sequence: z.coerce.number().int().min(0).max(999).default(0),
});

export type AssessmentTypeInput = z.infer<typeof assessmentTypeSchema>;

export const assessmentSchema = z
  .object({
    title: z.string().trim().min(1, 'Titre requis.').max(160),
    subjectId: z.uuid('Matière requise.'),
    classId: z.uuid('Classe requise.'),
    periodId: z.uuid('Période requise.'),
    assessmentTypeId: z.uuid('Type requis.'),
    gradingScaleId: z.uuid('Barème requis.'),
    teacherId: z.union([z.uuid(), z.literal('')]).optional(),
    assessmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.'),
    maxScore: z.coerce.number().min(0.5, 'Barème maximum invalide.').max(1000),
    coefficient: z.coerce.number().min(0.01, 'Coefficient positif requis.').max(100),
    isEliminatory: z.coerce.boolean().default(false),
    eliminatoryThreshold: z.union([z.coerce.number().min(0).max(1000), z.literal('')]).optional(),
  })
  .refine((v) => !v.isEliminatory || (v.eliminatoryThreshold !== '' && v.eliminatoryThreshold !== undefined), {
    message: 'Un seuil est requis pour une note éliminatoire.',
    path: ['eliminatoryThreshold'],
  });

export type AssessmentInput = z.infer<typeof assessmentSchema>;
