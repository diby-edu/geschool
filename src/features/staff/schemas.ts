import { z } from 'zod';
import { STAFF_FUNCTIONS } from '@/lib/permissions/roles';
import { DIPLOMA_CODES } from '@/lib/hr';

/**
 * Personnel ADMINISTRATIF (directeur, censeur, secrétaire, informaticien…). Les
 * enseignants ont leur propre module et leur propre fiche. Le téléphone principal
 * est l'identifiant de connexion (code école + téléphone), comme pour les
 * enseignants.
 */

export { DIPLOMAS, EMPLOYMENT_OPTIONS } from '@/lib/hr';

const date = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.'), z.literal('')]).optional();
const text = (max: number) => z.string().trim().max(max, `${max} caractères au plus.`).optional().or(z.literal(''));

export const staffSchema = z.object({
  lastName: z.string().trim().min(1, 'Nom requis.').max(80),
  firstName: z.string().trim().min(1, 'Prénom requis.').max(80),
  gender: z.enum(['M', 'F'], { message: 'Choisissez le sexe.' }),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'HOURLY', 'INTERN', 'OTHER'], {
    message: 'Choisissez le type de contrat.',
  }),
  birthDate: date,
  birthPlace: text(120),
  functions: z.array(z.enum(STAFF_FUNCTIONS)).min(1, 'Choisissez au moins une fonction.'),
  phone: z.string().trim().min(6, 'Téléphone requis.').max(30),
  phone2: text(30),
  email: z.union([z.email('E-mail invalide.'), z.literal('')]).optional(),
  diploma: z.union([z.enum(DIPLOMA_CODES), z.literal('')]).optional(),
  diplomaDetail: text(160),
  staffNumber: text(30),
  hireDate: date,
});

/** À la modification, le téléphone de connexion ne change pas (il porte l'accès). */
export const staffUpdateSchema = staffSchema.omit({ phone: true }).extend({
  functions: z.array(z.enum(STAFF_FUNCTIONS)).optional(),
});

export type StaffInput = z.infer<typeof staffSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
