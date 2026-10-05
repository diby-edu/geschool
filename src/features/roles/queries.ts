import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/permissions';
import { roleLabel, STAFF_FUNCTIONS, type RoleCode } from '@/lib/permissions/roles';
import type { TenantContext } from '@/lib/tenant/context';

export type RoleSummary = {
  id: string;
  code: string;
  name: string;
  description: string;
  /** Nombre de personnes qui exercent la fonction ; null si l'utilisateur ne peut pas les compter. */
  members: number | null;
  /** Le Fondateur est complet et non modifiable. */
  locked: boolean;
};

/** Ordre d'affichage : le Fondateur d'abord, puis les fonctions du personnel. */
const ORDER: readonly string[] = ['SCHOOL_ADMIN', ...STAFF_FUNCTIONS];

/**
 * Fonctions PROPRES à l'établissement (copies des modèles, voir migration 0050).
 * Tant qu'elles n'existent pas, l'établissement utilise les modèles partagés,
 * qu'on ne peut pas régler : il faut d'abord « personnaliser ».
 */
export async function listSchoolRoles(ctx: TenantContext): Promise<RoleSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('roles')
    .select('id, code, name, description')
    .eq('school_id', ctx.school.id);
  if (error) throw error;

  const roles = (data ?? []).filter((r) => ORDER.includes(r.code));
  if (roles.length === 0) return [];

  // Comptage : la RLS ne laisse voir que ses propres lignes sans `users.view`.
  let counts: Map<string, number> | null = null;
  if (hasPermission(ctx, 'users.view')) {
    const { data: links } = await supabase
      .from('membership_roles')
      .select('role_id')
      .in('role_id', roles.map((r) => r.id));
    counts = new Map();
    for (const l of links ?? []) counts.set(l.role_id, (counts.get(l.role_id) ?? 0) + 1);
  }

  return roles
    .map((r) => ({
      id: r.id,
      code: r.code,
      // Le libelle du code fait foi (accents, vocabulaire) plutot que le nom copie en base.
      name: roleLabel(r.code as RoleCode),
      description: r.description,
      members: counts ? (counts.get(r.id) ?? 0) : null,
      locked: r.code === 'SCHOOL_ADMIN',
    }))
    .sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
}

/** Codes des droits accordés à un rôle de l'établissement. */
export async function getRolePermissionCodes(ctx: TenantContext, roleId: string): Promise<string[]> {
  const supabase = await createClient();
  // Le rôle doit être celui de CET établissement (jamais un identifiant pris tel quel dans l'URL).
  const { data: role } = await supabase
    .from('roles')
    .select('id')
    .eq('id', roleId)
    .eq('school_id', ctx.school.id)
    .maybeSingle();
  if (!role) return [];
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permissions(code)')
    .eq('role_id', roleId);
  if (error) throw error;
  return ((data ?? []) as unknown as { permissions: { code: string } | null }[])
    .map((r) => r.permissions?.code)
    .filter((c): c is string => !!c);
}

/** Codes des droits que le modèle système d'une fonction accorde par défaut. */
export async function getTemplatePermissionCodes(roleCode: string): Promise<string[]> {
  const supabase = await createClient();
  const { data: template } = await supabase
    .from('roles')
    .select('id')
    .is('school_id', null)
    .eq('code', roleCode)
    .maybeSingle();
  if (!template) return [];
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permissions(code)')
    .eq('role_id', template.id);
  if (error) throw error;
  return ((data ?? []) as unknown as { permissions: { code: string } | null }[])
    .map((r) => r.permissions?.code)
    .filter((c): c is string => !!c);
}

/** Codes qui existent réellement dans le catalogue de la base. */
export async function listExistingPermissionCodes(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('permissions').select('code').eq('is_platform_only', false);
  if (error) throw error;
  return new Set((data ?? []).map((p) => p.code));
}

/**
 * Droits EFFECTIFS d'une fonction dans cet établissement : sa copie propre si
 * l'établissement a personnalisé ses fonctions, sinon le modèle partagé.
 */
export async function getFunctionPermissionCodes(ctx: TenantContext, roleCode: string): Promise<string[]> {
  const supabase = await createClient();
  const { data: own } = await supabase
    .from('roles')
    .select('id')
    .eq('school_id', ctx.school.id)
    .eq('code', roleCode)
    .maybeSingle();
  return own ? getRolePermissionCodes(ctx, own.id) : getTemplatePermissionCodes(roleCode);
}

/**
 * Les droits de TOUTES les fonctions de l'etablissement, en une requete.
 *
 * Sert la vue d'ensemble : une case par droit et par fonction. La lire ligne
 * par ligne demanderait une requete par fonction — onze allers-retours pour un
 * tableau qu'on regarde d'un coup d'oeil.
 */
export async function allRolePermissions(ctx: TenantContext): Promise<Map<string, Set<string>>> {
  const supabase = await createClient();
  const { data: roles } = await supabase.from('roles').select('id, code').eq('school_id', ctx.school.id);
  const parId = new Map((roles ?? []).map((r) => [r.id, r.code]));
  if (parId.size === 0) return new Map();

  const { data, error } = await supabase
    .from('role_permissions')
    .select('role_id, permissions(code)')
    .in('role_id', [...parId.keys()]);
  if (error) throw error;

  const out = new Map<string, Set<string>>();
  for (const code of parId.values()) out.set(code, new Set());
  for (const l of (data ?? []) as unknown as { role_id: string; permissions: { code: string } | null }[]) {
    const roleCode = parId.get(l.role_id);
    if (roleCode && l.permissions?.code) out.get(roleCode)!.add(l.permissions.code);
  }
  return out;
}
