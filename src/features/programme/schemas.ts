import { z } from 'zod';

/**
 * Programme d'un niveau (level_subjects, docs/DATABASE.md §7) : pour un niveau
 * donne, la liste des matieres avec leur coefficient et leur volume horaire.
 * C'est ce gabarit qui pondere les moyennes generales (lot 8).
 */
export const levelSubjectSchema = z.object({
  levelId: z.uuid('Niveau requis.'),
  subjectId: z.uuid('Matiere requise.'),
  coefficient: z.coerce.number({ error: 'Coefficient invalide.' }).positive('Coefficient positif requis.').max(100),
  weeklyMinutes: z.coerce.number({ error: 'Volume invalide.' }).int().min(0).max(3000).default(0),
  isMandatory: z.coerce.boolean().default(true),
});

export type LevelSubjectInput = z.infer<typeof levelSubjectSchema>;
