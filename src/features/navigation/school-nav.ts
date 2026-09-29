import type { TenantContext } from '@/lib/tenant/context';
import { hasAnyPermission } from '@/lib/permissions';
import type { NavItem } from '@/components/layout/AppShell';
import type { PermissionCode } from '@/lib/permissions';
import type { Space } from '@/lib/permissions/roles';
import type { ModuleKey } from '@/lib/modules';
import { featureEnabled, type FeatureCode } from '@/lib/modules/features';

/**
 * Navigation de l'espace etablissement, filtree par permissions.
 *
 * Regle §77 : on ne liste QUE des pages qui existent reellement et auxquelles
 * l'utilisateur a acces. Chaque entree declare les permissions qui l'ouvrent ;
 * une entree sans permission correspondante n'apparait pas.
 *
 * Le menu ne garde que ce qui sert AU QUOTIDIEN. La configuration (annees,
 * structure, classes, matieres, salles, abonnement, roles, audit…) vit dans la page
 * Parametres (features/settings/hub.ts) : `inHub` masque l'entree du menu de la
 * direction, sans la retirer de l'espace Enseignant (qui n'a pas de Parametres).
 */
type NavDef = {
  path: string;
  label: string;
  any: PermissionCode[];
  section: string;
  icon: ModuleKey;
  inHub?: boolean;
  /** Module vendable : l'entrée disparaît si la plateforme l'a coupé (0070). */
  feature?: FeatureCode;
};

const QUOTIDIEN = 'Au quotidien';
const COMPTES = 'Comptes';

const MODULES: NavDef[] = [
  { path: 'personnel', label: 'Personnel', any: ['users.view'], section: COMPTES, icon: 'personnel' },
  { path: 'teachers', label: 'Enseignants', any: ['teachers.view'], section: COMPTES, icon: 'enseignants' },
  { path: 'students', label: 'Élèves', any: ['students.view'], section: COMPTES, icon: 'eleves' },
  { path: 'access', label: 'Gestion des accès', any: ['access_accounts.view'], section: COMPTES, icon: 'acces' },

  { path: 'schedule', label: 'Emploi du temps', any: ['schedule.view'], section: QUOTIDIEN, icon: 'edt', feature: 'schedule' },
  { path: 'evaluations', label: 'Notes & évaluations', any: ['assessments.view'], section: QUOTIDIEN, icon: 'notes', feature: 'grades' },
  { path: 'attendance', label: 'Présences', any: ['attendance.view', 'attendance.view_all'], section: QUOTIDIEN, icon: 'presences', feature: 'attendance' },
  { path: 'bulletins', label: 'Bulletins', any: ['reports.view'], section: QUOTIDIEN, icon: 'bulletins', feature: 'bulletins' },
  { path: 'annonces', label: 'Annonces', any: ['announcements.view'], section: QUOTIDIEN, icon: 'annonces', feature: 'announcements' },
  { path: 'discipline', label: 'Discipline', any: ['discipline.view', 'discipline.create'], section: QUOTIDIEN, icon: 'presences', feature: 'discipline' },
  // Configuration : accessible depuis Paramètres pour la direction ; l'enseignant garde le Programme.
  { path: 'programme', label: 'Programme', any: ['subjects.view'], section: QUOTIDIEN, icon: 'edt', inHub: true },
];

/** Modules qu'ouvre l'espace Enseignant (son menu ne montre pas ceux de la Direction). */
const TEACHER_SPACE_PATHS = new Set(['schedule', 'evaluations', 'attendance', 'bulletins', 'annonces', 'programme', 'discipline']);

export function buildSchoolNav(ctx: TenantContext, space: Space): NavItem[] {
  const base = `/e/${ctx.school.slug}`;
  const nav: NavItem[] = [{ href: `${base}/dashboard`, label: 'Tableau de bord', icon: 'dashboard' }];

  // Espace Parent : uniquement le suivi de ses enfants — jamais les modules d'un
  // autre role que la personne pourrait cumuler.
  if (space === 'parent') {
    if (featureEnabled(ctx.disabledFeatures, 'parent_portal') && featureEnabled(ctx.disabledFeatures, 'bulletins')) {
      nav.push({ href: `${base}/mes-bulletins`, label: 'Mes bulletins', icon: 'bulletins' });
    }
    return nav;
  }

  for (const m of MODULES) {
    if (space === 'teacher' && !TEACHER_SPACE_PATHS.has(m.path)) continue;
    if (space === 'school' && m.inHub) continue;
    if (m.feature && !featureEnabled(ctx.disabledFeatures, m.feature)) continue;
    if (hasAnyPermission(ctx, m.any)) {
      nav.push({ href: `${base}/${m.path}`, label: m.label, section: m.section, icon: m.icon });
    }
  }

  // Notifications (cloche) et Paramètres (menu de la photo) vivent desormais dans
  // la barre du haut : les repeter ici encombrerait le menu pour rien.
  return nav;
}
