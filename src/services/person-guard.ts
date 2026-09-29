import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { permissionLabel } from '@/lib/permissions/catalog';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';
import { AuthorizationError, NotFoundError } from '@/lib/errors';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * Pas d'élévation de privilèges par les personnes.
 *
 * La base interdit déjà d'accorder à un rôle, ou d'attribuer à quelqu'un, un droit
 * qu'on ne possède pas (déclencheurs de la migration 0050). Ces gardes appliquent
 * la MÊME règle aux actions qui passent par le client service_role — afficher
 * un mot de passe temporaire, suspendre un accès — et dont la base ne peut donc
 * pas juger l'auteur.
 *
 * Règle : on ne gère que des personnes dont TOUS les droits sont inclus dans les
 * siens. Sans elle, un informaticien pourrait afficher le mot de passe du directeur
 * et se connecter à sa place. Le fondateur ne peut être géré que par lui-même.
 * Un droit manquant chez l'acteur, ou une lecture impossible, refuse (échec fermé).
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Droits (codes) d'une fonction pour cet établissement : sa copie propre, sinon le modèle. */
async function functionPermissionCodes(admin: Admin, schoolId: string, code: string): Promise<Set<string>> {
  const { data: candidates, error } = await admin
    .from('roles')
    .select('id, school_id')
    .eq('code', code)
    .or(`school_id.eq.${schoolId},school_id.is.null`);
  if (error) throw error;
  const role = candidates?.find((r) => r.school_id === schoolId) ?? candidates?.find((r) => r.school_id === null);
  if (!role) throw new NotFoundError('Fonction introuvable.');
  return rolePermissionCodes(admin, [role.id]);
}

async function rolePermissionCodes(admin: Admin, roleIds: string[]): Promise<Set<string>> {
  if (roleIds.length === 0) return new Set();
  const { data, error } = await admin
    .from('role_permissions')
    .select('permissions(code)')
    .in('role_id', roleIds);
  if (error) throw error;
  return new Set(
    ((data ?? []) as unknown as { permissions: { code: string } | null }[])
      .map((r) => r.permissions?.code)
      .filter((c): c is string => !!c),
  );
}

/** Fonctions (codes) et droits cumulés d'une personne dans l'établissement. */
export async function loadPersonRoles(
  schoolId: string,
  userId: string,
): Promise<{ roleCodes: string[]; permissions: Set<string> } | null> {
  const admin = createAdminClient('access.person_guard');
  const { data: membership, error } = await admin
    .from('school_memberships')
    .select('id')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!membership) return null;

  const { data: links, error: linkError } = await admin
    .from('membership_roles')
    .select('roles(id, code)')
    .eq('membership_id', membership.id);
  if (linkError) throw linkError;
  const roles = ((links ?? []) as unknown as { roles: { id: string; code: string } | null }[])
    .map((l) => l.roles)
    .filter((r): r is { id: string; code: string } => !!r);

  return {
    roleCodes: roles.map((r) => r.code),
    permissions: await rolePermissionCodes(admin, roles.map((r) => r.id)),
  };
}

/**
 * L'auteur peut-il gérer cette personne (afficher son mot de passe, suspendre son
 * accès, modifier ses fonctions) ? Lui-même : toujours (les actions qui ne doivent
 * pas viser soi-même le vérifient à part). Super Admin : toujours.
 */
export async function assertCanManagePerson(ctx: TenantContext, userId: string): Promise<{ roleCodes: string[] }> {
  if (ctx.isPlatformAdmin) return { roleCodes: [] };
  const target = await loadPersonRoles(ctx.school.id, userId);
  if (!target) throw new NotFoundError('Personne introuvable dans cet établissement.');
  if (userId === ctx.user.id) return { roleCodes: target.roleCodes };

  if (target.roleCodes.includes('SCHOOL_ADMIN')) {
    throw new AuthorizationError('Le fondateur ne peut être géré que par lui-même.');
  }
  const missing = [...target.permissions].filter((c) => !ctx.permissions.has(c));
  if (missing.length > 0) {
    throw new AuthorizationError(
      `Vous ne pouvez pas gérer cette personne : sa fonction comporte des droits que vous ne possédez pas (par exemple « ${permissionLabel(missing[0]!)} »).`,
    );
  }
  return { roleCodes: target.roleCodes };
}

/**
 * Réinitialiser ou renvoyer un accès : le nouveau mot de passe part vers le
 * téléphone ou l'e-mail DE LA PERSONNE, jamais à l'auteur — pas d'usurpation
 * possible, la règle d'inclusion des droits ne s'applique donc pas (sinon
 * l'informaticien ne pourrait plus aider un enseignant). Seul le fondateur reste
 * hors d'atteinte : le forcer à changer son mot de passe relève de lui seul.
 */
export async function assertCanResetAccess(ctx: TenantContext, userId: string): Promise<void> {
  if (ctx.isPlatformAdmin || userId === ctx.user.id) return;
  const target = await loadPersonRoles(ctx.school.id, userId);
  if (!target) throw new NotFoundError('Personne introuvable dans cet établissement.');
  if (target.roleCodes.includes('SCHOOL_ADMIN')) {
    throw new AuthorizationError('Le fondateur ne peut être géré que par lui-même.');
  }
}

/** L'auteur peut-il attribuer ces fonctions ? Chacune ne doit contenir que des droits qu'il possède. */
export async function assertCanGrantFunctions(ctx: TenantContext, functions: readonly string[]): Promise<void> {
  if (ctx.isPlatformAdmin) return;
  const admin = createAdminClient('access.person_guard');
  for (const code of functions) {
    if (code === 'SCHOOL_ADMIN') {
      throw new AuthorizationError('La fonction de fondateur ne peut pas être attribuée.');
    }
    const permissions = await functionPermissionCodes(admin, ctx.school.id, code);
    const missing = [...permissions].filter((c) => !ctx.permissions.has(c));
    if (missing.length > 0) {
      throw new AuthorizationError(
        `Vous ne pouvez pas attribuer la fonction « ${roleLabel(code as RoleCode)} » : elle comporte des droits que vous ne possédez pas (par exemple « ${permissionLabel(missing[0]!)} »).`,
      );
    }
  }
}
