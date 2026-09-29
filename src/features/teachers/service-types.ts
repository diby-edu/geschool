/**
 * Le vocabulaire du service hebdomadaire, sans aucun accès à la base.
 *
 * Ce fichier est volontairement séparé de `service-defaults.ts` : le
 * formulaire de réglage est un composant CLIENT, et importer depuis un module
 * marqué `server-only` entraînerait toute la chaîne serveur — Supabase,
 * cookies, permissions — dans le navigateur. Next.js refuse alors la page
 * entière, et ni `tsc` ni ESLint ne le signalent.
 */

export const EMPLOYMENT_TYPES = ['PERMANENT', 'CONTRACT', 'HOURLY', 'INTERN', 'OTHER'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  PERMANENT: 'Permanent',
  CONTRACT: 'Contractuel',
  HOURLY: 'Vacataire',
  INTERN: 'Stagiaire',
  OTHER: 'Autre',
};

/** Bornes d'un type de contrat, en SÉANCES. `null` = l'école n'a rien fixé. */
export type ServiceBounds = { min: number | null; max: number | null };
export type ServiceDefaults = Record<EmploymentType, ServiceBounds>;

/** Aucune borne : ni minimum, ni maximum. */
export const NO_BOUNDS: ServiceBounds = { min: null, max: null };

/**
 * Les bornes qui s'appliquent réellement à un enseignant : les siennes si elles
 * existent, sinon celles de son contrat. Renvoie des MINUTES, l'unité de la base.
 */
export function effectiveBounds(
  teacher: { weekly_minutes_min: number | null; weekly_minutes_max: number | null; employment_type: string },
  defaults: ServiceDefaults,
  sessionMinutes: number,
): { minMinutes: number | null; maxMinutes: number | null; fromDefault: boolean } {
  const own = { min: teacher.weekly_minutes_min, max: teacher.weekly_minutes_max };
  if (own.min !== null || own.max !== null) {
    return { minMinutes: own.min, maxMinutes: own.max, fromDefault: false };
  }
  const fallback = defaults[teacher.employment_type as EmploymentType] ?? NO_BOUNDS;
  return {
    minMinutes: fallback.min === null ? null : fallback.min * sessionMinutes,
    maxMinutes: fallback.max === null ? null : fallback.max * sessionMinutes,
    fromDefault: fallback.min !== null || fallback.max !== null,
  };
}
