import type { TenantContext } from '@/lib/tenant/context';
import { hasAnyPermission } from '@/lib/permissions';
import type { NavItem } from '@/components/layout/AppShell';
import type { PermissionCode } from '@/lib/permissions';

/**
 * Navigation de l'espace etablissement, filtree par permissions.
 *
 * Regle §77 : on ne liste QUE des pages qui existent reellement et auxquelles
 * l'utilisateur a acces. Chaque entree declare les permissions qui l'ouvrent ;
 * une entree sans permission correspondante n'apparait pas. Les modules des
 * lots suivants s'ajoutent ici au fur et a mesure que leurs pages sont livrees.
 */
type NavDef = { path: string; label: string; any: PermissionCode[] };

const MODULES: NavDef[] = [
  { path: 'academic-years', label: 'Annees scolaires', any: ['academic_years.view'] },
  { path: 'structure', label: 'Structure', any: ['cycles.view', 'levels.view'] },
  { path: 'classes', label: 'Classes', any: ['classes.view'] },
  { path: 'students', label: 'Eleves', any: ['students.view'] },
  { path: 'access', label: 'Gestion des acces', any: ['access_accounts.view'] },
  { path: 'schedule', label: 'Emploi du temps', any: ['schedule.view'] },
  { path: 'evaluations', label: 'Evaluations', any: ['assessments.view'] },
  { path: 'attendance', label: 'Presences', any: ['attendance.view'] },
  { path: 'bulletins', label: 'Bulletins', any: ['reports.view'] },
  { path: 'annonces', label: 'Annonces', any: ['announcements.view'] },
  { path: 'subjects', label: 'Matieres', any: ['subjects.view'] },
  { path: 'programme', label: 'Programme', any: ['subjects.view'] },
  { path: 'teachers', label: 'Enseignants', any: ['teachers.view'] },
  { path: 'assignments', label: 'Affectations', any: ['assignments.view'] },
  { path: 'rooms', label: 'Salles', any: ['rooms.view'] },
];

export function buildSchoolNav(ctx: TenantContext): NavItem[] {
  const base = `/e/${ctx.school.slug}`;
  const nav: NavItem[] = [{ href: `${base}/dashboard`, label: 'Tableau de bord' }];

  for (const m of MODULES) {
    if (hasAnyPermission(ctx, m.any)) {
      nav.push({ href: `${base}/${m.path}`, label: m.label });
    }
  }

  // Portail famille/eleve : visible pour qui ne gere pas les bulletins (parents,
  // eleves). Le personnel utilise l'entree « Bulletins ». La RLS garantit que
  // chacun n'y voit que ses propres bulletins publies.
  if (!ctx.permissions.has('reports.view')) {
    nav.push({ href: `${base}/mes-bulletins`, label: 'Mes bulletins' });
  }

  // Boîte de notifications : pour tout membre (chacun n'y voit que les siennes).
  nav.push({ href: `${base}/notifications`, label: 'Notifications' });

  return nav;
}
