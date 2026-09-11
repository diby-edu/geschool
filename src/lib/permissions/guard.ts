import 'server-only';

import { notFound } from 'next/navigation';
import type { TenantContext } from '@/lib/tenant/context';
import { hasPermission, hasAnyPermission, type PermissionCode } from '@/lib/permissions';

/**
 * Garde de page : rend un 404 si l'utilisateur n'a pas la permission. On repond
 * 404 et non 403 pour ne pas confirmer l'existence d'une page a qui n'y a pas
 * acces (coherent avec la resolution du tenant, ARCHITECTURE.md §4).
 */
export function requirePageAccess(ctx: TenantContext, code: PermissionCode): void {
  if (!hasPermission(ctx, code)) notFound();
}

export function requirePageAccessAny(ctx: TenantContext, codes: readonly PermissionCode[]): void {
  if (!hasAnyPermission(ctx, codes)) notFound();
}
