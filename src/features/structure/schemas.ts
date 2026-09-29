import { z } from 'zod';

const code = z
  .string()
  .trim()
  .min(1, 'Code requis.')
  .max(20, 'Code trop long.')
  .transform((v) => v.toUpperCase().replace(/\s+/g, ''));

export const cycleSchema = z.object({
  code,
  name: z.string().trim().min(1, 'Nom requis.').max(80),
  sequence: z.coerce.number().int().min(0).max(100).default(0),
  /** Ordre d'enseignement du cycle : ses classes en héritent (découpage, congés). */
  track: z.enum(['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL']).default('GENERAL'),
});
export type CycleInput = z.infer<typeof cycleSchema>;

export const levelSchema = z.object({
  cycleId: z.uuid('Cycle requis.'),
  code,
  name: z.string().trim().min(1, 'Nom requis.').max(80),
  sequence: z.coerce.number().int().min(0).max(100).default(0),
  /** Diplôme préparé (formation professionnelle) : il range les niveaux et les bulletins. */
  diploma: z.string().trim().max(20).optional().or(z.literal('')),
});
export type LevelInput = z.infer<typeof levelSchema>;
