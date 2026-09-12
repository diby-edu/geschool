import { z } from 'zod';

/** Publics cibles d'une annonce (rôles). Le ciblage par classe viendra ensuite. */
export const AUDIENCE_ROLES = [
  { code: 'ALL', label: 'Tout l’établissement' },
  { code: 'PARENT', label: 'Parents' },
  { code: 'STUDENT', label: 'Élèves' },
  { code: 'TEACHER', label: 'Enseignants' },
  { code: 'SCHOOL_ADMIN', label: 'Administration' },
] as const;

export const announcementSchema = z
  .object({
    title: z.string().trim().min(1, 'Titre requis.').max(160),
    body: z.string().trim().min(1, 'Contenu requis.').max(5000),
    all: z.boolean().default(false),
    roles: z.array(z.string()).default([]),
    expiresAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional(),
  })
  .refine((v) => v.all || v.roles.length > 0, { message: 'Choisissez au moins un public.', path: ['roles'] });

export type AnnouncementInput = z.infer<typeof announcementSchema>;
