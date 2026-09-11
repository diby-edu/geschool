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
  capacity: z.coerce.number({ error: 'Capacite invalide.' }).int().min(0, 'Capacite invalide.').max(2000),
  building: z.string().trim().max(60).optional().or(z.literal('')),
  floor: z.string().trim().max(30).optional().or(z.literal('')),
  isAccessible: z.coerce.boolean().default(true),
  isActive: z.coerce.boolean().default(true),
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
});

export type RoomTypeInput = z.infer<typeof roomTypeSchema>;
