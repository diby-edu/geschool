import { z } from 'zod';

/** Salle (docs/DATABASE.md §8). */
export const roomSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Code requis.')
    .max(20, 'Code trop long.')
    .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  name: z.string().trim().min(1, 'Nom requis.').max(120, 'Nom trop long.'),
  roomTypeId: z.uuid().optional().or(z.literal('')),
  capacity: z.coerce.number({ error: 'Capacité invalide.' }).int().min(0, 'Capacité invalide.').max(2000),
  building: z.string().trim().max(60).optional().or(z.literal('')),
  floor: z.string().trim().max(30).optional().or(z.literal('')),
  isActive: z.coerce.boolean().default(true),
  /** Ordres d'enseignement servis. Vide = tous ceux de l'établissement. */
  tracks: z.array(z.enum(['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'])).default([]),
  /** Équipements présents dans la salle (paillasses, postes, machines…). */
  features: z.array(z.uuid()).default([]),
});

export type RoomInput = z.infer<typeof roomSchema>;

/** Type de salle (LAB, GYM, IT, STANDARD…). */
export const roomTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Code requis.')
    .max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  name: z.string().trim().min(1, 'Nom requis.').max(80),
  /**
   * Ordres d'enseignement où ce type a un sens. Vide = tous ceux de
   * l'établissement : le service s'en charge, la base refuse une liste vide.
   */
  tracks: z.array(z.enum(['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'])).default([]),
});

export type RoomTypeInput = z.infer<typeof roomTypeSchema>;
