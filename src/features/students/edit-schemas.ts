import { z } from 'zod';

/**
 * Correction du dossier d'un élève après son inscription (nom mal orthographié,
 * date de naissance erronée, matricule reçu plus tard de l'État…). Mêmes
 * exigences qu'à l'inscription : un dossier scolaire ivoirien porte le sexe, la
 * date ET le lieu de naissance, et le statut d'affectation.
 */
export function studentIdentitySchemaFor(matriculeRequired: boolean) {
  return z.object({
    matricule: matriculeRequired
      ? z.string().trim().min(1, 'Matricule requis.').max(40)
      : z.string().trim().max(40).optional().or(z.literal('')),
    firstName: z.string().trim().min(1, 'Prénom requis.').max(80),
    lastName: z.string().trim().min(1, 'Nom requis.').max(80),
    gender: z.enum(['M', 'F', 'OTHER'], { message: 'Sexe requis.' }),
    birthDate: z.iso.date('Date de naissance requise.'),
    birthPlace: z.string().trim().min(1, 'Lieu de naissance requis.').max(120),
    isStateAssigned: z.enum(['1', '0'], { message: 'Statut requis.' }),
  });
}

export type StudentIdentityInput = z.infer<ReturnType<typeof studentIdentitySchemaFor>>;

export const RELATIONSHIPS = ['FATHER', 'MOTHER', 'TUTOR', 'LEGAL_GUARDIAN', 'SIBLING', 'OTHER'] as const;

/** Un responsable légal de l'élève : nom, téléphone (son identifiant de connexion), lien. */
export const guardianEditSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis.').max(80),
  lastName: z.string().trim().min(1, 'Nom requis.').max(80),
  phone: z.string().trim().min(1, 'Téléphone requis.').max(30),
  relationship: z.enum(RELATIONSHIPS, { message: 'Lien requis.' }),
  isPrimaryContact: z.boolean(),
});

export type GuardianEditInput = z.infer<typeof guardianEditSchema>;
