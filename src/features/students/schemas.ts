import { z } from 'zod';

const guardian = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  relationship: z.enum(['FATHER', 'MOTHER', 'TUTOR', 'LEGAL_GUARDIAN', 'SIBLING', 'OTHER']),
  isPrimaryContact: z.boolean(),
});

/**
 * Inscription d'un eleve avec ses responsables (docs/ACCESS_MANAGEMENT.md §3).
 * Les responsables sont saisis dans le meme dossier ; leurs comptes en
 * decoulent automatiquement.
 */
export const enrollSchema = z.object({
  firstName: z.string().trim().min(1, 'Prenom requis.').max(80),
  lastName: z.string().trim().min(1, 'Nom requis.').max(80),
  gender: z.enum(['M', 'F', 'OTHER']).optional().or(z.literal('')),
  birthDate: z.iso.date('Date invalide.').optional().or(z.literal('')),
  classId: z.uuid('Classe requise.'),
  guardians: z.array(guardian).max(4),
});

export type EnrollFormInput = z.infer<typeof enrollSchema>;
