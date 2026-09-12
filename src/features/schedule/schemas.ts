import { z } from 'zod';

/** Configuration de la grille horaire (docs/SCHEDULE_ENGINE.md §3). */
export const scheduleConfigSchema = z
  .object({
    workingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Choisissez au moins un jour.'),
    dayStart: z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.'),
    dayEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.'),
    slotMinutes: z.coerce.number().int().min(15, 'Minimum 15 min.').max(240),
  })
  .refine((v) => v.dayEnd > v.dayStart, { message: 'La fin doit suivre le debut.', path: ['dayEnd'] });

export type ScheduleConfigInput = z.infer<typeof scheduleConfigSchema>;

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
