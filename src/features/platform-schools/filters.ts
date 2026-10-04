/**
 * Les filtres de la liste des établissements.
 *
 * Ils existent pour une raison précise : les chiffres du tableau de bord
 * plateforme (« Suspendus », « Essais qui se terminent », « Écoles à formule
 * réduite ») doivent MENER quelque part. Un compteur qui appelle le clic et ne
 * mène nulle part est une promesse non tenue ; chaque filtre d'ici est la
 * destination d'un de ces chiffres, et le nombre affiché doit s'y retrouver à
 * l'identique — d'où `ESSAI_BIENTOT_JOURS`, calé sur la requête du tableau de
 * bord (platform-dashboard/queries.ts).
 *
 * Rien ici ne touche à la base : la liste est déjà chargée, on ne fait que la
 * restreindre. C'est aussi ce qui rend ces règles testables.
 */

export const SCHOOL_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'ARCHIVED'] as const;
export type SchoolStatusFilter = (typeof SCHOOL_STATUSES)[number];

export const ABONNEMENTS = ['actif', 'essai', 'essai-bientot', 'retard', 'aucun'] as const;
export type AbonnementFilter = (typeof ABONNEMENTS)[number];

/** Fenêtre des essais « qui se terminent », identique à celle du tableau de bord. */
export const ESSAI_BIENTOT_JOURS = 30;

export const STATUS_LABEL: Record<SchoolStatusFilter, string> = {
  ACTIVE: 'Actifs',
  PENDING: 'En attente',
  SUSPENDED: 'Suspendus',
  ARCHIVED: 'Archivés',
};

export const ABONNEMENT_LABEL: Record<AbonnementFilter, string> = {
  actif: 'Abonnement actif',
  essai: 'En essai',
  'essai-bientot': 'Essai qui se termine',
  retard: 'Paiement en retard',
  aucun: 'Sans abonnement',
};

/** Le minimum dont les filtres ont besoin : une ligne de `listSchoolsForAdmin`. */
export type FilterableSchool = {
  name: string;
  slug: string;
  city: string | null;
  status: string;
  disabledModules: number;
  subscription: { status: string; trialEndsOn: string | null } | null;
};

export type SchoolFilters = {
  statut: SchoolStatusFilter | null;
  abonnement: AbonnementFilter | null;
  /** Ne garder que les écoles dont au moins un module est coupé. */
  modulesReduits: boolean;
  q: string;
};

export const AUCUN_FILTRE: SchoolFilters = { statut: null, abonnement: null, modulesReduits: false, q: '' };

const premier = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v)?.toString().trim() ?? '';

/** Lit les filtres dans l'URL. Une valeur inconnue est ignorée, jamais une erreur. */
export function parseSchoolFilters(sp: Record<string, string | string[] | undefined>): SchoolFilters {
  const statut = premier(sp.statut).toUpperCase();
  const abonnement = premier(sp.abonnement).toLowerCase();
  return {
    statut: (SCHOOL_STATUSES as readonly string[]).includes(statut) ? (statut as SchoolStatusFilter) : null,
    abonnement: (ABONNEMENTS as readonly string[]).includes(abonnement) ? (abonnement as AbonnementFilter) : null,
    modulesReduits: premier(sp.modules) === 'reduits',
    q: premier(sp.q),
  };
}

export function filtreActif(f: SchoolFilters): boolean {
  return f.statut !== null || f.abonnement !== null || f.modulesReduits || f.q !== '';
}

/** L'adresse d'un filtre, à poser sur un compteur. */
export function schoolsHref(f: Partial<SchoolFilters>): string {
  const p = new URLSearchParams();
  if (f.statut) p.set('statut', f.statut);
  if (f.abonnement) p.set('abonnement', f.abonnement);
  if (f.modulesReduits) p.set('modules', 'reduits');
  if (f.q) p.set('q', f.q);
  const qs = p.toString();
  return qs ? `/admin/etablissements?${qs}` : '/admin/etablissements';
}

function essaiFinit(sub: FilterableSchool['subscription'], now: Date): boolean {
  if (!sub || sub.status !== 'TRIALING' || !sub.trialEndsOn) return false;
  const limite = new Date(now.getTime() + ESSAI_BIENTOT_JOURS * 24 * 60 * 60 * 1000);
  return new Date(sub.trialEndsOn) <= limite;
}

function correspondAbonnement(school: FilterableSchool, filtre: AbonnementFilter, now: Date): boolean {
  const statut = school.subscription?.status ?? null;
  switch (filtre) {
    case 'actif':
      return statut === 'ACTIVE';
    case 'essai':
      return statut === 'TRIALING';
    case 'essai-bientot':
      return essaiFinit(school.subscription, now);
    case 'retard':
      return statut === 'PAST_DUE';
    case 'aucun':
      return statut === null;
  }
}

/** Accents et casse ignorés : on cherche « Kédougou » en tapant « kedougou ». */
function normalise(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterSchools<T extends FilterableSchool>(rows: T[], f: SchoolFilters, now = new Date()): T[] {
  const q = normalise(f.q);
  return rows.filter((s) => {
    if (f.statut && s.status !== f.statut) return false;
    if (f.abonnement && !correspondAbonnement(s, f.abonnement, now)) return false;
    if (f.modulesReduits && s.disabledModules === 0) return false;
    if (q && !normalise(`${s.name} ${s.slug} ${s.city ?? ''}`).includes(q)) return false;
    return true;
  });
}

export type SchoolCounts = {
  total: number;
  statut: Record<SchoolStatusFilter, number>;
  abonnement: Record<AbonnementFilter, number>;
  modulesReduits: number;
};

/** Les nombres portés par les pastilles — comptés sur TOUTE la liste, pas sur le filtre en cours. */
export function countSchools(rows: FilterableSchool[], now = new Date()): SchoolCounts {
  const statut = { ACTIVE: 0, PENDING: 0, SUSPENDED: 0, ARCHIVED: 0 } as Record<SchoolStatusFilter, number>;
  const abonnement = { actif: 0, essai: 0, 'essai-bientot': 0, retard: 0, aucun: 0 } as Record<AbonnementFilter, number>;
  let modulesReduits = 0;

  for (const s of rows) {
    if (s.status in statut) statut[s.status as SchoolStatusFilter] += 1;
    for (const a of ABONNEMENTS) if (correspondAbonnement(s, a, now)) abonnement[a] += 1;
    if (s.disabledModules > 0) modulesReduits += 1;
  }

  return { total: rows.length, statut, abonnement, modulesReduits };
}
