import { z } from 'zod';

/** Configuration de la grille horaire (docs/SCHEDULE_ENGINE.md §3). */
/**
 * Un horaire par jour travaille, pas un seul horaire pour toute la semaine :
 * la grille de creneaux (time_slots, migration 0016) l'a toujours permis
 * ("un mercredi a trois creneaux matinaux et un lundi a six cohabitent"),
 * seul ce formulaire l'ignorait jusqu'ici.
 */
const dayHourSchema = z.object({
  day: z.coerce.number().int().min(1).max(7),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.'),
});

export const scheduleConfigSchema = z
  .object({
    workingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Choisissez au moins un jour.'),
    slotMinutes: z.coerce.number().int().min(15, 'Minimum 15 min.').max(240),
    dayHours: z.array(dayHourSchema),
  })
  .refine((v) => v.dayHours.every((h) => h.end > h.start), {
    message: 'Pour chaque jour, la fin doit suivre le début.',
    path: ['dayHours'],
  })
  .refine((v) => v.workingDays.every((d) => v.dayHours.some((h) => h.day === d)), {
    message: 'Chaque jour travaillé doit avoir un horaire de début et de fin.',
    path: ['workingDays'],
  });

export type ScheduleConfigInput = z.infer<typeof scheduleConfigSchema>;
export type DayHour = z.infer<typeof dayHourSchema>;

/**
 * Ajout d'une seance (cible : une classe). Le jour est deduit du creneau de
 * debut, ce qui evite une incoherence jour/creneau a la saisie.
 */
export const sessionSchema = z.object({
  startSlotId: z.uuid('Creneau de debut requis.'),
  endSlotId: z.uuid('Creneau de fin requis.'),
  subjectId: z.uuid('Matiere requise.'),
  teacherId: z.uuid().optional().or(z.literal('')),
  classId: z.uuid('Classe requise.'),
  roomId: z.uuid().optional().or(z.literal('')),
});

export type SessionInput = z.infer<typeof sessionSchema>;

/** Reglage d'une exigence pedagogique (docs/DATABASE.md §7, additif §22). */
export const requirementSchema = z.object({
  sessionsCount: z.coerce.number().int().min(1, 'Au moins une seance.').max(20),
  sessionDurationMinutes: z.coerce.number().int().min(15).max(480),
  roomMode: z.enum(['NONE', 'PREFERRED', 'REQUIRED_ROOM', 'REQUIRED_TYPE']),
  status: z.enum(['DRAFT', 'ACTIVE', 'SATISFIED', 'IGNORED']),
});

export type RequirementInput = z.infer<typeof requirementSchema>;
