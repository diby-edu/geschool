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
  /** Salle de rattachement (salle de classe) : préférence pour l'emploi du temps. */
  mainRoomId: z.uuid().optional().or(z.literal('')),
});

export type ClassInput = z.infer<typeof classSchema>;

/**
 * Création en série : on choisit un niveau, puis une classe unique (avec un
 * suffixe facultatif) ou plusieurs d'un coup, numérotées en chiffres ou en
 * lettres. Les noms sont calculés par `naming.ts` et montrés avant de valider.
 */
export const classBatchSchema = z
  .object({
    levelId: z.uuid('Niveau requis.'),
    mode: z.enum(['ONE', 'MANY']).default('ONE'),
    /** Mode « une classe » : 1, 2, A, B… ou rien. */
    suffix: z.string().trim().max(10, 'Suffixe trop long.').optional().or(z.literal('')),
    /** Mode « plusieurs » : combien en créer. */
    count: z.coerce.number().int().min(1, 'Au moins une classe.').max(60, '60 classes au plus à la fois.').default(1),
    numbering: z.enum(['DIGITS', 'LETTERS']).default('DIGITS'),
    capacity: z.coerce.number().int().min(0).max(500).default(0),
    /** Un professeur principal ne se donne qu'à une classe unique. */
    headTeacherId: z.uuid().optional().or(z.literal('')),
    mainRoomId: z.uuid().optional().or(z.literal('')),
  })
  .refine((v) => v.mode !== 'MANY' || v.count >= 1, { message: 'Indiquez le nombre de classes.', path: ['count'] });

export type ClassBatchInput = z.infer<typeof classBatchSchema>;
