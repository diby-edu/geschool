import 'server-only';

import type { TenantContext } from '@/lib/tenant/context';
import { AuthorizationError } from '@/lib/errors';

/**
 * RBAC applicatif (docs/RBAC.md §4).
 *
 * Les permissions sont deja chargees dans le contexte (un Set), donc
 * hasPermission est une simple recherche — aucun aller-retour. Le Super Admin
 * passe tout (ADR-007).
 *
 * Rappel : ces verifications sont la PREMIERE barriere applicative. La RLS
 * reste active derriere, en defense en profondeur. Une permission accordee ici
 * n'ouvre l'ETABLISSEMENT ; le PERIMETRE (sa classe, ses enfants) est verifie
 * separement, cote base, par les policies.
 */

export type PermissionCode = string;

export function hasPermission(ctx: TenantContext, code: PermissionCode): boolean {
  return ctx.isPlatformAdmin || ctx.permissions.has(code);
}

export function hasAnyPermission(ctx: TenantContext, codes: readonly PermissionCode[]): boolean {
  if (ctx.isPlatformAdmin) return true;
  return codes.some((c) => ctx.permissions.has(c));
}

/**
 * Exige une permission dans une Server Action. Leve AuthorizationError (403)
 * a defaut. A appeler APRES getTenantContext et AVANT toute ecriture.
 */
export function requirePermission(ctx: TenantContext, code: PermissionCode): void {
  if (!hasPermission(ctx, code)) {
    throw new AuthorizationError(
      `Permission requise : ${code}.`,
    );
  }
}

/**
 * Exige que l'etablissement soit inscriptible (ni suspendu, ni annee close) EN
 * PLUS de la permission. Toute ecriture metier devrait passer par ici.
 */
export function requireWritable(ctx: TenantContext, code: PermissionCode): void {
  requirePermission(ctx, code);
  if (!ctx.isPlatformAdmin && ctx.school.status !== 'ACTIVE') {
    // Meme code que la RLS (TenantReadOnlyError serait plus precis, mais on
    // reste sur 403 cote action ; la RLS refusera de toute facon l'ecriture).
    throw new AuthorizationError(
      "Cet etablissement est en lecture seule : aucune modification n'est possible.",
    );
  }
}
