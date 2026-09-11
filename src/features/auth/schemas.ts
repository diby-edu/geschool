import { z } from 'zod';

/**
 * Politique de mot de passe. Volontairement simple et sans exigence
 * decorative (pas de « au moins un caractere special ») : une longueur
 * minimale serieuse protege mieux qu'un jeu de regles que les utilisateurs
 * contournent par « Motdepasse1! ». 10 caracteres minimum.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caracteres.')
  .max(200, 'Mot de passe trop long.');

export const emailLoginSchema = z.object({
  email: z.email('Adresse email invalide.'),
  password: z.string().min(1, 'Mot de passe requis.'),
  next: z.string().optional(),
});

export const schoolLoginSchema = z.object({
  slug: z.string().min(1),
  identifier: z.string().min(1, 'Identifiant requis.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});

export const firstLoginSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string().min(1, 'Confirmation requise.'),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirm'],
  });

export const passwordResetRequestSchema = z.object({
  email: z.email('Adresse email invalide.'),
});

export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
export type SchoolLoginInput = z.infer<typeof schoolLoginSchema>;
export type FirstLoginInput = z.infer<typeof firstLoginSchema>;
