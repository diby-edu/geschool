import { z } from 'zod';

/** Enseignant (docs/DATABASE.md §6). Le compte de connexion est cree separement
 * (module Gestion des acces, lot 5) ; ici on gere le dossier professionnel. */
export const teacherSchema = z.object({
  staffNumber: z
    .string()
    .trim()
    .min(1, 'Matricule requis.')
    .max(30)
    .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  firstName: z.string().trim().min(1, 'Prenom requis.').max(80),
  lastName: z.string().trim().min(1, 'Nom requis.').max(80),
  gender: z.enum(['M', 'F', 'OTHER']).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.email('Email invalide.').optional().or(z.literal('')),
  specialty: z.string().trim().max(120).optional().or(z.literal('')),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'HOURLY', 'INTERN', 'OTHER']).default('PERMANENT'),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'LEFT']).default('ACTIVE'),
});

export type TeacherInput = z.infer<typeof teacherSchema>;
