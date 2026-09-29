import { z } from 'zod';

/** Configuration de la grille horaire (docs/SCHEDULE_ENGINE.md §3). */
/**
 * Un horaire par jour travaille, pas un seul horaire pour toute la semaine :
 * la grille de creneaux (time_slots, migration 0016) l'a toujours permis
 * ("un mercredi a trois creneaux matinaux et un lundi a six cohabitent"),
 * seul ce formulaire l'ignorait jusqu'ici.
 */
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.');

/**
 * Horaire d'un jour : début du matin (`start`), fin de la journée (`end`) et, s'il
 * y a cours l'après-midi, la pause déjeuner entre les deux (fin du matin =
 * `lunchStart`, reprise de l'après-midi = `lunchEnd`).
 */
const dayHourSchema = z.object({
  day: z.coerce.number().int().min(1).max(7),
  start: hhmm,
  end: hhmm,
  lunchStart: hhmm.optional(),
  lunchEnd: hhmm.optional(),
});

/**
 * Pause (recreation, dejeuner…) appliquee chaque jour travaille, a la meme
 * heure — c'est ainsi que les etablissements fonctionnent en pratique (pas
 * une recreation a 10h le lundi et a 11h le mardi). Un jour raccourci qui ne
 * couvre pas l'heure de la pause l'ignore simplement (cf. saveConfig).
 */
const breakSchema = z
  .object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.'),
    label: z.string().trim().min(1, 'Nom requis.').max(60),
  })
  .refine((v) => v.end > v.start, { message: 'La fin doit suivre le début.', path: ['end'] });

export const scheduleConfigSchema = z
  .object({
    workingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Choisissez au moins un jour.'),
    slotMinutes: z.coerce.number().int().min(15, 'Minimum 15 min.').max(240),
    dayHours: z.array(dayHourSchema),
    breaks: z.array(breakSchema).max(3, 'Trois pauses au maximum.').default([]),
  })
  .refine((v) => v.dayHours.every((h) => h.end > h.start), {
    message: 'Pour chaque jour, la fin doit suivre le début.',
    path: ['dayHours'],
  })
  .refine(
    (v) =>
      v.dayHours.every(
        (h) => !h.lunchStart || !h.lunchEnd || (h.start < h.lunchStart && h.lunchStart < h.lunchEnd && h.lunchEnd < h.end),
      ),
    { message: 'Pour chaque jour : le matin finit avant la reprise de l’après-midi, et chaque demi-journée a une fin après son début.', path: ['dayHours'] },
  )
  .refine((v) => v.workingDays.every((d) => v.dayHours.some((h) => h.day === d)), {
    message: 'Chaque jour travaillé doit avoir un horaire de début et de fin.',
    path: ['workingDays'],
  })
  .refine(
    (v) => v.breaks.every((b, i) => v.breaks.every((b2, j) => i === j || b.end <= b2.start || b2.end <= b.start)),
    { message: 'Les pauses ne doivent pas se chevaucher.', path: ['breaks'] },
  );

export type ScheduleConfigInput = z.infer<typeof scheduleConfigSchema>;
export type DayHour = z.infer<typeof dayHourSchema>;
export type BreakInput = z.infer<typeof breakSchema>;

/**
 * Ajout d'une seance (cible : une classe). Le jour est deduit du creneau de
 * debut, ce qui evite une incoherence jour/creneau a la saisie.
 */
export const sessionSchema = z.object({
  startSlotId: z.uuid('Créneau de début requis.'),
  endSlotId: z.uuid('Créneau de fin requis.'),
  subjectId: z.uuid('Matière requise.'),
  teacherId: z.uuid().optional().or(z.literal('')),
  classId: z.uuid('Classe requise.'),
  roomId: z.uuid().optional().or(z.literal('')),
});

export type SessionInput = z.infer<typeof sessionSchema>;

/** Reglage d'une exigence pedagogique (docs/DATABASE.md §7, additif §22). */
export const requirementSchema = z.object({
  sessionsCount: z.coerce.number().int().min(1, 'Au moins une séance.').max(20),
  sessionDurationMinutes: z.coerce.number().int().min(15).max(480),
  roomMode: z.enum(['NONE', 'PREFERRED', 'REQUIRED_ROOM', 'REQUIRED_TYPE']),
  /**
   * Cible de la règle : « R:<uuid> » pour une salle précise, « T:<uuid> » pour
   * un type de salle. Un seul champ dans le formulaire, plus simple qu'un menu
   * par mode — le mode dit si c'est un souhait ou une obligation.
   */
  roomTarget: z.string().trim().max(60).optional().or(z.literal('')),
  minCapacity: z.coerce.number().int().min(0).max(2000).optional(),
  /** Équipements exigés : la salle doit tous les avoir. */
  requiredFeatures: z.array(z.uuid()).default([]),
  status: z.enum(['DRAFT', 'ACTIVE', 'SATISFIED', 'IGNORED']),
});

export type RequirementInput = z.infer<typeof requirementSchema>;
