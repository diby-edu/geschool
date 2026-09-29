import { z } from 'zod';
import { GROUP_KINDS } from './kinds';

/**
 * Un groupe d'élèves (docs/DATABASE.md §16). Le code est la référence courte
 * qu'on retrouve sur l'emploi du temps ; le nom est ce que lisent les familles.
 */
export const groupSchema = z.object({
  code: z.string().trim().min(1, 'Code requis.').max(30),
  name: z.string().trim().min(1, 'Nom requis.').max(120),
  kind: z.enum(GROUP_KINDS, { message: 'Type requis.' }),
  /** Matière enseignée à ce groupe. Facultative : un club n'en a pas. */
  subjectId: z.union([z.uuid(), z.literal('')]).optional(),
  maxSize: z.union([z.coerce.number().int().min(1).max(500), z.literal('')]).optional(),
  /** Les classes d'où le groupe tire ses élèves. Au moins une. */
  classIds: z.array(z.uuid()).min(1, 'Choisissez au moins une classe.'),
});

export type GroupInput = z.infer<typeof groupSchema>;
