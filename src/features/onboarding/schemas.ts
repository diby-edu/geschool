import { z } from 'zod';
import { passwordSchema } from '@/features/auth/schemas';

export const EDUCATION_TRACK_VALUES = ['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'] as const;
export const MODULE_CODE_VALUES = ['SCOL', 'APPEL'] as const;

/**
 * Un seul schema couvrant les 3 etapes du wizard : la soumission finale
 * n'arrive qu'une fois, avec tous les champs (cf. SignupWizard.tsx, un seul
 * <form> englobant les 3 etapes).
 */
export const registerSchoolSchema = z
  .object({
    // Etape 1 — Etablissement
    name: z.string().trim().min(1, "Le nom de l'etablissement est requis.").max(160),
    city: z.string().trim().min(1, 'La ville est requise.').max(80),
    neighborhood: z.string().trim().min(1, 'Le quartier est requis.').max(80),
    autoGenerateCode: z.coerce.boolean().default(false),
    registrationNumber: z.string().trim().max(60).optional().or(z.literal('')),
    educationTracks: z
      .array(z.enum(EDUCATION_TRACK_VALUES))
      .min(1, "Selectionnez au moins un ordre d'enseignement."),

    // Etape 2 — Modules
    modules: z.array(z.enum(MODULE_CODE_VALUES)).min(1, 'Choisissez au moins un module.'),
    parentPortalEnabled: z.coerce.boolean().default(false),

    // Etape 3 — Compte administrateur
    firstName: z.string().trim().min(1, 'Le prenom est requis.').max(80),
    lastName: z.string().trim().min(1, 'Le nom est requis.').max(80),
    phone: z.string().trim().min(1, 'Le telephone est requis.').max(30),
    email: z.email('Adresse email invalide.'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirmation requise.'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  })
  .refine((v) => v.autoGenerateCode || v.registrationNumber !== '', {
    message: "Indiquez le code officiel, ou cochez la case pour en generer un.",
    path: ['registrationNumber'],
  })
  // Defensif : l'interface empeche deja d'activer l'Espace Parent sans module,
  // mais la regle doit tenir meme si la requete contourne le client.
  .refine((v) => !v.parentPortalEnabled || v.modules.length > 0, {
    message: "L'Espace Parent necessite au moins un module actif.",
    path: ['parentPortalEnabled'],
  });

export type RegisterSchoolFormInput = z.infer<typeof registerSchoolSchema>;
