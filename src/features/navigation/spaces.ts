import 'server-only';

import { cookies } from 'next/headers';
import { hasPermission } from '@/lib/permissions';
import type { Space } from '@/lib/permissions/roles';
import type { TenantContext } from '@/lib/tenant/context';

/** Rôles qui n'appartiennent pas au personnel : ils n'ouvrent pas l'espace Direction. */
const NON_STAFF_ROLES = ['TEACHER', 'PARENT', 'STUDENT'] as const;

/**
 * Espaces d'un membre de l'etablissement. Une personne peut cumuler des roles
 * (enseignant ET parent, direction ET enseignant) : chaque role ouvre un
 * ESPACE distinct — tableau de bord et menu propres — et l'utilisateur
 * choisit celui qu'il ouvre. On ne melange jamais les modules de deux roles
 * dans un meme ecran.
 *
 * Un espace est une commodite de navigation, PAS une frontiere de securite :
 * les droits restent portes par les permissions et la RLS, quelle que soit
 * l'URL ouverte.
 */

export const SPACE_LABELS: Record<Space, string> = {
  school: 'Direction',
  teacher: 'Enseignant',
  parent: 'Parent',
};

export const SPACE_HINTS: Record<Space, string> = {
  school: "Gérer l'établissement : élèves, classes, comptes, bulletins.",
  teacher: 'Mes classes, l\'appel, mes notes et mon emploi du temps.',
  parent: 'Suivre mes enfants : notes, absences et bulletins.',
};

export const spaceCookie = (slug: string) => `gs_space_${slug}`;

/** Espaces ouverts a l'utilisateur, du plus privilegie au moins privilegie. */
export function availableSpaces(ctx: TenantContext): Space[] {
  const roles = ctx.membership?.roles ?? [];
  const spaces: Space[] = [];
  // Une fonction du personnel ouvre l'espace Direction MEME si le fondateur a decoche
  // « consulter les eleves » : decocher un droit ne doit jamais renvoyer quelqu'un
  // dans l'espace Parent.
  const isStaff = roles.some((r) => !(NON_STAFF_ROLES as readonly string[]).includes(r));
  if (ctx.isPlatformAdmin || isStaff || hasPermission(ctx, 'students.view')) spaces.push('school');
  if (roles.includes('TEACHER')) spaces.push('teacher');
  if (roles.includes('PARENT')) spaces.push('parent');
  // Aucun role reconnu : l'espace le plus restreint, par prudence.
  return spaces.length > 0 ? spaces : ['parent'];
}

/** Espace choisi et retenu sur cet appareil, s'il est encore valide. */
export async function getSavedSpace(ctx: TenantContext): Promise<Space | null> {
  const saved = (await cookies()).get(spaceCookie(ctx.school.slug))?.value;
  return saved && (availableSpaces(ctx) as string[]).includes(saved) ? (saved as Space) : null;
}

/** Espace actif : le choix retenu, sinon le plus privilegie. */
export async function getActiveSpace(ctx: TenantContext): Promise<Space> {
  return (await getSavedSpace(ctx)) ?? availableSpaces(ctx)[0]!;
}
