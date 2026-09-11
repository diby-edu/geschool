import { z } from 'zod';

/** Classe (docs/DATABASE.md §5). Rattachee a l'annee courante et a un niveau. */
export const classSchema = z.object({
  levelId: z.uuid('Niveau requis.'),
  code: z
    .string()
    .trim()
    .min(1, 'Code requis.')
    .max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  name: z.string().trim().min(1, 'Nom requis.').max(80),
  capacity: z.coerce.number().int().min(0).max(500).default(0),
  headTeacherId: z.uuid().optional().or(z.literal('')),
});

export type ClassInput = z.infer<typeof classSchema>;
