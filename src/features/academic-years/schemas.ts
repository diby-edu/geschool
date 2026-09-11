import { z } from 'zod';

/** Annee scolaire (docs/DATABASE.md §4). */
export const academicYearSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis.').max(40, 'Nom trop long.'),
    startsOn: z.iso.date('Date de debut invalide.'),
    endsOn: z.iso.date('Date de fin invalide.'),
  })
  .refine((v) => v.endsOn > v.startsOn, {
    message: 'La date de fin doit etre posterieure au debut.',
    path: ['endsOn'],
  });

export type AcademicYearInput = z.infer<typeof academicYearSchema>;

/** Periode academique (trimestre, semestre…). */
export const periodSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis.').max(60),
    sequence: z.coerce.number({ error: 'Rang invalide.' }).int().min(1).max(20),
    kind: z.enum(['TERM', 'SEMESTER', 'QUARTER']).default('TERM'),
    startsOn: z.iso.date('Date de debut invalide.'),
    endsOn: z.iso.date('Date de fin invalide.'),
    isGradingPeriod: z.coerce.boolean().default(true),
  })
  .refine((v) => v.endsOn > v.startsOn, {
    message: 'La date de fin doit etre posterieure au debut.',
    path: ['endsOn'],
  });

export type PeriodInput = z.infer<typeof periodSchema>;
