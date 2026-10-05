'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { runFormAction, type FormState } from '@/lib/forms';
import { hasPermission, requireWritable } from '@/lib/permissions';
import { CATALOG_CODES, permissionLabel } from '@/lib/permissions/catalog';
import { AuthorizationError, NotFoundError, ValidationError } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { getRolePermissionCodes, getTemplatePermissionCodes } from './queries';

/** Message lisible pour une erreur de la base (les garde-fous de la migration 0050 sont en français). */
function dbError(error: { code?: string; message?: string }): never {
  if (error.code === '42501') throw new AuthorizationError(error.message ?? 'Action refusée.');
  throw new Error(error.message ?? 'Erreur base de données');
}

/** Le rôle doit appartenir à l'établissement et ne pas être celui du Fondateur. */
async function loadEditableRole(schoolId: string, roleId: string) {
  const supabase = await createClient();
  const { data: role } = await supabase
    .from('roles')
    .select('id, code, name')
    .eq('id', roleId)
    .eq('school_id', schoolId)
    .maybeSingle();
  if (!role) throw new NotFoundError('Fonction introuvable.');
  if (role.code === 'SCHOOL_ADMIN') {
    throw new ValidationError('Le Fondateur a tous les droits ; ils ne se modifient pas.');
  }
  return role;
}

/** Duplique les modèles de fonctions pour l'établissement (une seule fois). */
export async function customizeRolesAction(slug: string, _prev: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'users.assign_roles');
    const supabase = await createClient();
    const { error } = await supabase.rpc('customize_roles' as never, { p_school: ctx.school.id } as never);
    if (error) dbError(error as { code?: string; message?: string });
    await audit(ctx, { action: 'roles.customize', module: 'roles', entityType: 'school', entityId: ctx.school.id });
    redirect(`/e/${slug}/roles?customized=1`);
  });
}

/**
 * Enregistre les droits d'une fonction. Seuls les droits du catalogue sont
 * touchés ; ceux qu'il ne propose pas restent tels quels.
 */
export async function saveRolePermissionsAction(
  slug: string,
  roleId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'users.assign_roles');
    const role = await loadEditableRole(ctx.school.id, roleId);

    const wanted = new Set(formData.getAll('perm').filter((v): v is string => typeof v === 'string' && CATALOG_CODES.has(v)));
    const current = new Set((await getRolePermissionCodes(ctx, roleId)).filter((c) => CATALOG_CODES.has(c)));
    const added = [...wanted].filter((c) => !current.has(c));
    const removed = [...current].filter((c) => !wanted.has(c));
    if (added.length === 0 && removed.length === 0) redirect(`/e/${slug}/roles?role=${role.code}`);

    // Message clair avant la base (qui refuse aussi, en dernier recours).
    const notHeld = added.filter((c) => !hasPermission(ctx, c));
    if (notHeld.length > 0) {
      throw new AuthorizationError(
        `Vous ne pouvez pas accorder un droit que vous ne possédez pas : ${notHeld.map(permissionLabel).join(' ; ')}.`,
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc(
      'set_role_permissions' as never,
      { p_role: roleId, p_add: added, p_remove: removed } as never,
    );
    if (error) dbError(error as { code?: string; message?: string });

    await audit(ctx, {
      action: 'roles.permissions.update',
      module: 'roles',
      entityType: 'role',
      entityId: roleId,
      after: { role: role.code, added, removed },
    });
    redirect(`/e/${slug}/roles?role=${role.code}&saved=1`);
  });
}

/** Rétablit les droits d'origine de la fonction (ceux du modèle). */
export async function resetRoleAction(slug: string, roleId: string, _prev: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'users.assign_roles');
    const role = await loadEditableRole(ctx.school.id, roleId);

    const template = new Set(await getTemplatePermissionCodes(role.code));
    if (template.size === 0) throw new NotFoundError('Modèle de fonction introuvable.');
    const current = new Set(await getRolePermissionCodes(ctx, roleId));
    const added = [...template].filter((c) => !current.has(c));
    const removed = [...current].filter((c) => !template.has(c));

    const supabase = await createClient();
    const { error } = await supabase.rpc(
      'set_role_permissions' as never,
      { p_role: roleId, p_add: added, p_remove: removed } as never,
    );
    if (error) dbError(error as { code?: string; message?: string });

    await audit(ctx, {
      action: 'roles.permissions.reset',
      module: 'roles',
      entityType: 'role',
      entityId: roleId,
      after: { role: role.code, added, removed },
    });
    redirect(`/e/${slug}/roles?role=${role.code}&reset=1`);
  });
}

/**
 * Bascule UN droit d'UNE fonction, depuis la vue d'ensemble.
 *
 * Le tableau croise sert a reperer l'anomalie — « le secretaire peut-il
 * vraiment publier les bulletins ? » — et a la corriger sur place, sans
 * rouvrir la fiche de la fonction. Les memes gardes s'appliquent : on
 * n'accorde pas un droit qu'on ne detient pas soi-meme, et la base refuse en
 * dernier recours.
 */
export async function togglePermissionAction(
  slug: string,
  roleId: string,
  code: string,
  grant: boolean,
  _prev: FormState,
  _fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'users.assign_roles');
    const role = await loadEditableRole(ctx.school.id, roleId);
    if (!CATALOG_CODES.has(code)) throw new NotFoundError('Droit inconnu.');

    if (grant && !hasPermission(ctx, code)) {
      throw new AuthorizationError(
        `Vous ne pouvez pas accorder un droit que vous ne possédez pas : ${permissionLabel(code)}.`,
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc(
      'set_role_permissions' as never,
      { p_role: roleId, p_add: grant ? [code] : [], p_remove: grant ? [] : [code] } as never,
    );
    if (error) dbError(error as { code?: string; message?: string });

    await audit(ctx, {
      action: 'roles.permissions.update',
      module: 'roles',
      entityType: 'role',
      entityId: roleId,
      after: { role: role.code, ...(grant ? { added: [code] } : { removed: [code] }) },
    });
    redirect(`/e/${slug}/roles?vue=ensemble&maj=${encodeURIComponent(code)}`);
  });
}
