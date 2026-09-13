import { z } from 'zod';

/** États d'un élève à l'appel (docs/DATABASE.md §20). */
export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

export const attendanceEntrySchema = z.object({
  studentId: z.uuid(),
  status: z.enum(ATTENDANCE_STATUSES),
  minutesLate: z.coerce.number().int().min(0).max(600).default(0),
  comment: z.string().trim().max(200).default(''),
});

export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;

/** Opération d'appel, telle qu'envoyée (en ligne ou rejouée hors ligne). */
export const attendanceSaveSchema = z.object({
  clientOperationId: z.uuid(),
  occurrenceId: z.uuid(),
  entries: z.array(attendanceEntrySchema),
  // Enchaine le verrouillage (submit) juste apres l'enregistrement, en UNE
  // seule operation reseau : le bouton « Valider l'appel » (tableau de bord
  // enseignant) n'a ainsi qu'une seule chose a mettre en file hors ligne,
  // pas deux appels a coordonner separement.
  alsoSubmit: z.coerce.boolean().default(false),
});

export type AttendanceSaveInput = z.infer<typeof attendanceSaveSchema>;

export const justificationSchema = z
  .object({
    studentId: z.uuid('Élève requis.'),
    coversFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.'),
    coversTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.'),
    reason: z.string().trim().min(3, 'Motif requis.').max(500),
  })
  .refine((v) => v.coversTo >= v.coversFrom, { message: 'La date de fin doit suivre le début.', path: ['coversTo'] });

export type JustificationInput = z.infer<typeof justificationSchema>;
