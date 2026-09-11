import type { TenantContext } from '@/lib/tenant/context';
import { hasAnyPermission } from '@/lib/permissions';
import type { NavItem } from '@/components/layout/AppShell';

/**
 * Navigation de l'espace etablissement, filtree par permissions.
 *
 * Regle §77 : on ne liste QUE des pages qui existent reellement et auxquelles
 * l'utilisateur a acces. Les entrees commentees correspondent aux modules des
 * lots suivants ; elles seront activees quand leurs pages seront livrees, pas
 * avant — pas de lien mort, pas de « bientot disponible ».
 */
export function buildSchoolNav(ctx: TenantContext): NavItem[] {
  const base = `/e/${ctx.school.slug}`;
  const nav: NavItem[] = [{ href: `${base}/dashboard`, label: "Tableau de bord" }];

  // Les modules ci-dessous arrivent au lot 4. Exemple d'activation conditionnee
  // par la permission, a decommenter quand la page existe :
  //
  // if (hasAnyPermission(ctx, ['students.view'])) {
  //   nav.push({ href: `${base}/students`, label: 'Eleves' });
  // }
  void hasAnyPermission;

  return nav;
}
