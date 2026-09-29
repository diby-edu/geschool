import { z } from 'zod';

/**
 * Matiere (docs/DATABASE.md §7). Le code identifie la matiere dans
 * l'etablissement : normalise en majuscules, sans espaces, comme les autres
 * codes de reference.
 */
export const subjectSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Code requis.')
    .max(20, 'Code trop long (20 caracteres max).')
    .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  name: z.string().trim().min(1, 'Nom requis.').max(120, 'Nom trop long.'),
  shortName: z.string().trim().max(30, 'Abreviation trop longue.').optional().or(z.literal('')),
  category: z.string().trim().max(60).optional().or(z.literal('')),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (format #RRGGBB).')
    .optional()
    .or(z.literal('')),
  defaultCoefficient: z.coerce
    .number({ error: 'Coefficient invalide.' })
    .positive('Le coefficient doit être positif.')
    .max(100, 'Coefficient trop élève.'),
  isActive: z.coerce.boolean().default(true),
  /** Ordres où la matière est enseignée : une matière commune les coche tous. */
  tracks: z.array(z.enum(['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'])).min(1, 'Choisissez au moins un ordre d’enseignement.'),
});

export type SubjectInput = z.infer<typeof subjectSchema>;
