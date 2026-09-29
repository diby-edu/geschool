import { z } from 'zod';
import { DIPLOMA_CODES } from '@/lib/hr';

/** Enseignant (docs/DATABASE.md §6). Le compte de connexion est cree separement
 * (module Gestion des acces, lot 5) ; ici on gere le dossier professionnel. */
const date = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.'), z.literal('')]).optional();
const text = (max: number) => z.string().trim().max(max, `${max} caracteres au plus.`).optional().or(z.literal(''));

export const teacherSchema = z.object({
  staffNumber: z
    .string()
    .trim()
    .min(1, 'Matricule requis.')
    .max(30)
    .transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  firstName: z.string().trim().min(1, 'Prénom requis.').max(80),
  lastName: z.string().trim().min(1, 'Nom requis.').max(80),
  gender: z.enum(['M', 'F', 'OTHER']).optional().or(z.literal('')),
  birthDate: date,
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.email('Email invalide.').optional().or(z.literal('')),
  address: text(200),
  specialty: text(120),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'HOURLY', 'INTERN', 'OTHER'], {
    message: 'Choisissez le type de contrat.',
  }),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'LEFT']).default('ACTIVE'),
  hireDate: date,
  diploma: z.union([z.enum(DIPLOMA_CODES), z.literal('')]).optional(),
  diplomaDetail: text(160),
  /**
   * Service hebdomadaire, en SÉANCES. Vide = aucune borne déclarée.
   * Le plafond sert d'alerte sur la grille d'affectation, avant la génération.
   */
  minSessions: z.coerce.number().int().min(0).max(60).optional().or(z.literal('')),
  maxSessions: z.coerce.number().int().min(0).max(60).optional().or(z.literal('')),
});

export type TeacherInput = z.infer<typeof teacherSchema>;
