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
 *
 * Les champs obligatoires sont ceux que reclame un dossier scolaire ivoirien :
 * le matricule (attribue par l'Etat AVANT l'inscription), le sexe, la date ET
 * le lieu de naissance, la classe, le redoublement et le statut d'affectation.
 * La date de naissance est exigee pour une raison technique autant
 * qu'administrative : c'est elle qui distingue deux homonymes, a l'import comme
 * a la saisie.
 *
 * Le matricule n'est obligatoire que si l'ecole le recoit de l'Etat ; celle qui
 * l'attribue elle-meme peut le laisser vide (reglage `matriculeMode`).
 */
export function enrollSchemaFor(matriculeRequired: boolean) {
  return z.object({
    matricule: matriculeRequired
      ? z.string().trim().min(1, 'Matricule requis.').max(40)
      : z.string().trim().max(40).optional().or(z.literal('')),
    firstName: z.string().trim().min(1, 'Prénom requis.').max(80),
    lastName: z.string().trim().min(1, 'Nom requis.').max(80),
    gender: z.enum(['M', 'F', 'OTHER'], { message: 'Sexe requis.' }),
    birthDate: z.iso.date('Date de naissance requise.'),
    birthPlace: z.string().trim().min(1, 'Lieu de naissance requis.').max(120),
    classId: z.uuid('Classe requise.'),
    isRepeating: z.coerce.boolean(),
    isStateAssigned: z.enum(['1', '0'], { message: 'Statut requis.' }),
    /**
     * Langue vivante 2. Vide quand le niveau n'en a pas au programme : la
     * grille officielle n'en donne ni en 6eme ni en 5eme, et exiger une langue
     * la ou la matiere n'existe pas bloquerait toutes ces inscriptions.
     */
    lv2: z.string().trim().max(60).optional().or(z.literal('')),
    guardians: z.array(guardian).max(4),
  });
}

export type EnrollFormInput = z.infer<ReturnType<typeof enrollSchemaFor>>;
