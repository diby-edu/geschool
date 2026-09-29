import { z } from 'zod';

/** Annee scolaire (docs/DATABASE.md §4). */
export const academicYearSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis.').max(40, 'Nom trop long.'),
    startsOn: z.iso.date('Date de début invalide.'),
    endsOn: z.iso.date('Date de fin invalide.'),
  })
  .refine((v) => v.endsOn > v.startsOn, {
    message: 'La date de fin doit être postérieure au début.',
    path: ['endsOn'],
  });

export type AcademicYearInput = z.infer<typeof academicYearSchema>;

/** Periode academique (trimestre, semestre…). */
export const periodSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis.').max(60),
    sequence: z.coerce.number({ error: 'Rang invalide.' }).int().min(1).max(20),
    kind: z.enum(['TERM', 'SEMESTER', 'QUARTER']).default('TERM'),
    startsOn: z.iso.date('Date de début invalide.'),
    endsOn: z.iso.date('Date de fin invalide.'),
    isGradingPeriod: z.coerce.boolean().default(true),
    /** Ordres concernés ; vide = toute l'école. « TECHNIQUE+PROFESSIONNEL » = les deux. */
    track: z.enum(['', 'GENERAL', 'TECHNIQUE', 'PROFESSIONNEL', 'TECHNIQUE+PROFESSIONNEL']).default(''),
  })
  .refine((v) => v.endsOn > v.startsOn, {
    message: 'La date de fin doit être postérieure au début.',
    path: ['endsOn'],
  });

export type PeriodInput = z.infer<typeof periodSchema>;

/** Congé, jour férié ou fermeture : aucun cours ces jours-là. */
export const CALENDAR_EVENT_KINDS = ['VACATION', 'PUBLIC_HOLIDAY', 'CLOSURE', 'EXAM', 'EVENT'] as const;

export const calendarEventSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis.').max(80, 'Nom trop long.'),
    kind: z.enum(CALENDAR_EVENT_KINDS).default('VACATION'),
    startsOn: z.iso.date('Date de début invalide.'),
    endsOn: z.iso.date('Date de fin invalide.'),
    blocksSchedule: z.coerce.boolean().default(true),
    /** Ordres concernés ; vide = toute l'école. « TECHNIQUE+PROFESSIONNEL » = les deux. */
    track: z.enum(['', 'GENERAL', 'TECHNIQUE', 'PROFESSIONNEL', 'TECHNIQUE+PROFESSIONNEL']).default(''),
  })
  .refine((v) => v.endsOn >= v.startsOn, {
    message: 'La date de fin ne peut pas précéder le début.',
    path: ['endsOn'],
  });

export type CalendarEventInput = z.infer<typeof calendarEventSchema>;

/** Modification d'une période : le rang ne change pas (il ordonne les bulletins). */
export const periodEditSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis.').max(60),
    kind: z.enum(['TERM', 'SEMESTER', 'QUARTER']).default('TERM'),
    startsOn: z.iso.date('Date de début invalide.'),
    endsOn: z.iso.date('Date de fin invalide.'),
    isGradingPeriod: z.coerce.boolean().default(true),
    /** Ordres concernés ; vide = toute l'école. « TECHNIQUE+PROFESSIONNEL » = les deux. */
    track: z.enum(['', 'GENERAL', 'TECHNIQUE', 'PROFESSIONNEL', 'TECHNIQUE+PROFESSIONNEL']).default(''),
  })
  .refine((v) => v.endsOn > v.startsOn, {
    message: 'La date de fin doit être postérieure au début.',
    path: ['endsOn'],
  });

export type PeriodEditInput = z.infer<typeof periodEditSchema>;
