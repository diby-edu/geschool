import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max, `${max} caractères au plus.`).optional().or(z.literal(''));

/**
 * Identité et coordonnées de l'établissement. Ne se modifient PAS ici : l'adresse
 * (slug), le code école (immuable, migration 0044), le pays, la monnaie et le statut.
 */
export const schoolIdentitySchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit comporter 2 caractères au moins.').max(120),
  shortName: text(40),
  directorName: text(120),
  registrationNumber: text(40),
  address: text(200),
  neighborhood: text(100),
  city: text(100),
  phone: text(30),
  email: z.union([z.email('E-mail invalide.'), z.literal('')]).optional(),
  website: z.union([z.url('Adresse web invalide (ex. https://mon-ecole.ci).'), z.literal('')]).optional(),
  /**
   * Ordres d'enseignement de l'établissement. Choisis à l'inscription, mais une
   * école qui ouvre une section technique ou professionnelle doit pouvoir les
   * compléter : c'est cette liste qui décide des niveaux officiels proposés, du
   * découpage de l'année (trimestres ou semestres) et des congés.
   */
  educationTracks: z
    .array(z.enum(['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL']))
    .min(1, 'Choisissez au moins un ordre d’enseignement.'),
});

export type SchoolIdentityInput = z.infer<typeof schoolIdentitySchema>;
