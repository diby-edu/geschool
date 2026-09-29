import type { LucideIcon } from 'lucide-react';
import { MODULE_LABEL, MODULE_STYLE, type ModuleKey, type ModuleStyle } from '@/lib/modules';
import { HUB } from '@/features/settings/hub';
import { MODULE_ICON } from './nav-modules';

/**
 * Couleurs d'une page de l'espace établissement, pour qu'elle porte le même habit
 * que son entrée du menu et que son bloc du tableau de bord (lib/modules.ts).
 *
 *  - Page d'un module du menu (Élèves, Présences…) : la couleur du module.
 *  - Page de configuration ouverte depuis Paramètres (Salles, Matières…) : la
 *    couleur de sa rubrique dans Paramètres (Établissement, Pédagogie, Compte).
 *  - Sinon (Super Admin, pages annexes) : l'indigo du tableau de bord.
 *
 * Données pures, calculées depuis l'adresse : aucune page n'a à déclarer son module.
 */

export type PageTheme = {
  /** Identifiant stable (module ou rubrique), posé en data-module pour le CSS. */
  key: string;
  style: ModuleStyle;
  icon: LucideIcon;
  /** Ligne au-dessus du titre : le module ou la rubrique de Paramètres. */
  eyebrow: string;
  /** Les boutons principaux prennent la couleur du module (pas pour les modules gris ni le tableau de bord). */
  brand: boolean;
};

/** Premier segment d'adresse sous /e/{slug}/ -> module du menu. */
const ROUTE_MODULE: Record<string, ModuleKey> = {
  dashboard: 'dashboard',
  espace: 'dashboard',
  personnel: 'personnel',
  teachers: 'enseignants',
  students: 'eleves',
  access: 'acces',
  schedule: 'edt',
  evaluations: 'notes',
  attendance: 'presences',
  bulletins: 'bulletins',
  'mes-bulletins': 'bulletins',
  annonces: 'annonces',
  notifications: 'notifications',
  parametres: 'parametres',
};

/** Rubriques de Paramètres (features/settings/hub.ts) : mêmes teintes que leurs cartes. */
const SECTION_STYLE: Record<string, ModuleStyle> = {
  indigo: MODULE_STYLE.dashboard,
  violet: {
    c1: '#5b21b6',
    c2: '#8b5cf6',
    onBlock: '#ffffff',
    tint: '#ede4ff',
    ink: '#5b21b6',
    dtint: 'rgba(167,139,250,0.18)',
    dink: '#c4b5fd',
  },
  amber: MODULE_STYLE.acces,
};

const NO_BRAND: ReadonlySet<string> = new Set(['dashboard', 'notifications', 'parametres']);

function moduleTheme(key: ModuleKey): PageTheme {
  return { key, style: MODULE_STYLE[key], icon: MODULE_ICON[key], eyebrow: MODULE_LABEL[key], brand: !NO_BRAND.has(key) };
}

export function pageTheme(pathname: string): PageTheme {
  const match = /^\/e\/[^/]+\/?(.*)$/.exec(pathname);
  if (!match) return { ...moduleTheme('dashboard'), eyebrow: 'Plateforme' };
  const rest = (match[1] ?? '').replace(/\/+$/, '');
  if (rest === '') return moduleTheme('dashboard');

  const first = rest.split('/')[0]!;
  const moduleKey = ROUTE_MODULE[first];
  if (moduleKey) return moduleTheme(moduleKey);

  // Page de configuration : la carte de Paramètres dont le chemin correspond le mieux.
  let found: { section: (typeof HUB)[number]; card: (typeof HUB)[number]['cards'][number] } | null = null;
  for (const section of HUB) {
    for (const card of section.cards) {
      if ((rest === card.path || rest.startsWith(`${card.path}/`)) && (!found || card.path.length > found.card.path.length)) {
        found = { section, card };
      }
    }
  }
  if (found) {
    return {
      key: `parametres-${found.section.id}`,
      style: SECTION_STYLE[found.section.tone] ?? MODULE_STYLE.parametres,
      icon: found.card.icon,
      eyebrow: `Paramètres · ${found.section.label}`,
      brand: true,
    };
  }
  return moduleTheme('dashboard');
}
