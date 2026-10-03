import { z } from 'zod';

/** Publics cibles d'une annonce, par fonction. S'ajoutent aux classes et aux niveaux. */
export const AUDIENCE_ROLES = [
  { code: 'ALL', label: 'Tout l’établissement' },
  { code: 'PARENT', label: 'Parents' },
  { code: 'TEACHER', label: 'Enseignants' },
  { code: 'SCHOOL_ADMIN', label: 'Personnel administratif' },
] as const;

export const announcementSchema = z
  .object({
    title: z.string().trim().min(1, 'Titre requis.').max(160),
    body: z.string().trim().min(1, 'Contenu requis.').max(5000),
    all: z.boolean().default(false),
    roles: z.array(z.string()).default([]),
    classIds: z.array(z.string().uuid()).default([]),
    levelIds: z.array(z.string().uuid()).default([]),
    expiresAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional(),
  })
  .refine((v) => v.all || v.roles.length > 0 || v.classIds.length > 0 || v.levelIds.length > 0, {
    message: 'Choisissez au moins un public : une fonction, une classe ou un niveau.',
    path: ['roles'],
  });

export type AnnouncementInput = z.infer<typeof announcementSchema>;
