import { z } from 'zod';

/** Creation d'un etablissement par le Super Admin (ADR-007). */
export const createSchoolSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis.').max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Slug invalide : lettres, chiffres et tirets (3 a 40).'),
  shortName: z.string().trim().max(40).optional().or(z.literal('')),
  schoolType: z.enum(['PRIMARY', 'SECONDARY', 'HIGH_SCHOOL', 'TECHNICAL', 'MIXED', 'OTHER']).default('SECONDARY'),
  countryCode: z.string().trim().length(2).toUpperCase().default('CI'),
  currency: z.string().trim().length(3).toUpperCase().default('XOF'),
  locale: z.string().trim().max(10).default('fr-CI'),
  timezone: z.string().trim().max(40).default('Africa/Abidjan'),
});

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;
