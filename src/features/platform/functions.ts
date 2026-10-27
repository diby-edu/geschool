import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isStaffFunction, roleLabel, STAFF_FUNCTIONS } from '@/lib/permissions/roles';
import { requireAdmin } from './admin';

/**
 * Les modèles des fonctions (lot 6, 0150) : les fonctions données à chaque
 * nouvelle école, avec leurs droits de départ. Le Fondateur (complet),
 * l'Enseignant, le Parent et l'Élève ne se règlent pas ici.
 */

export type FunctionTemplate = {
  id: string;
  code: string;
  label: string;
  description: string;
  custom: boolean;
  permissions: number;
  schools: number;
};

const ORDER: readonly string[] = ['SCHOOL_ADMIN', ...STAFF_FUNCTIONS];
const rank = (c: string) => (ORDER.includes(c) ? ORDER.indexOf(c) : ORDER.length);

export async function listFunctionTemplates(): Promise<FunctionTemplate[]> {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: tpls, error }, { data: copies }] = await Promise.all([
    supabase.from('roles').select('id, code, name, description, role_permissions(count)').is('school_id', null),
    supabase.from('roles').select('code').not('school_id', 'is', null),
  ]);
  if (error) throw error;
  const schools = new Map<string, number>();
  for (const c of (copies ?? []) as { code: string }[]) schools.set(c.code, (schools.get(c.code) ?? 0) + 1);
  type Row = { id: string; code: string; name: string; description: string; role_permissions: { count: number }[] };
  return ((tpls ?? []) as unknown as Row[])
    .filter((r) => r.code === 'SCHOOL_ADMIN' || isStaffFunction(r.code))
    .map((r) => ({
      id: r.id,
      code: r.code,
      label: roleLabel(r.code, r.name),
      description: r.description,
      custom: !ORDER.includes(r.code),
      permissions: r.role_permissions[0]?.count ?? 0,
      schools: schools.get(r.code) ?? 0,
    }))
    .sort((a, b) => rank(a.code) - rank(b.code) || a.label.localeCompare(b.label, 'fr'));
}

/** Les droits (codes) du modèle d'une fonction. */
export async function templatePermissionCodes(code: string): Promise<string[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from('role_permissions')
    .select('permissions(code), roles!inner(code, school_id)')
    .eq('roles.code', code)
    .is('roles.school_id', null);
  return ((data ?? []) as unknown as { permissions: { code: string } | null }[])
    .map((r) => r.permissions?.code)
    .filter((c): c is string => !!c);
}

/** Un code « F_… » à partir d'un nom : « Bibliothécaire » donne F_BIBLIOTHECAIRE. */
export function functionCodeFor(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return `F_${base.length >= 2 ? base : `${base}XX`}`;
}
