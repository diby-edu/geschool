/**
 * Codes des roles systeme (docs/RBAC.md §1). Ils correspondent exactement aux
 * `roles.code` du seed (migration 0028). La liste est fermee : un role
 * d'etablissement clone porte l'un de ces codes.
 */
export const ROLE_CODES = [
  'SCHOOL_ADMIN',
  'DIRECTOR',
  'DEPUTY_DIRECTOR',
  'CENSOR',
  'EDUCATION_INSPECTOR',
  'HEAD_SUPERVISOR',
  'SUPERVISOR',
  'SECRETARY',
  'IT_ADMIN',
  'ACCOUNTANT',
  'TEACHER',
  'PARENT',
  'STUDENT',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

/**
 * Espaces de l'application. Une seule application, plusieurs espaces selon le
 * role (ARCHITECTURE.md §3). Une personne qui cumule des roles ouvre l'espace de
 * son choix (features/navigation/spaces.ts).
 */
export type Space = 'school' | 'teacher' | 'parent';

const ROLE_LABELS: Record<RoleCode, string> = {
  SCHOOL_ADMIN: 'Fondateur',
  DIRECTOR: 'Directeur',
  DEPUTY_DIRECTOR: 'Directeur adjoint',
  CENSOR: 'Censeur',
  EDUCATION_INSPECTOR: "Inspecteur d'éducation",
  HEAD_SUPERVISOR: 'Surveillant général',
  SUPERVISOR: 'Éducateur',
  SECRETARY: 'Secrétaire',
  IT_ADMIN: 'Informaticien',
  ACCOUNTANT: 'Comptable',
  TEACHER: 'Enseignant',
  PARENT: 'Parent',
  STUDENT: 'Élève',
};

/**
 * Fonctions du PERSONNEL ADMINISTRATIF que le fondateur peut attribuer et dont il
 * règle les droits (page « Rôles et droits », module Personnel). Les enseignants
 * se gèrent dans Enseignants ; parents et élèves n'ont pas de droits réglables.
 * Le Comptable n'y figure pas : le produit ne gère pas l'argent des inscriptions
 * (sa ligne est conservée en base, elle n'est ni proposée ni dupliquée).
 * Le Fondateur (SCHOOL_ADMIN) est à part : complet et non modifiable.
 */
export const STAFF_FUNCTIONS = [
  'DIRECTOR',
  'DEPUTY_DIRECTOR',
  'CENSOR',
  'EDUCATION_INSPECTOR',
  'HEAD_SUPERVISOR',
  'SUPERVISOR',
  'SECRETARY',
  'IT_ADMIN',
] as const satisfies readonly RoleCode[];

export type StaffFunction = (typeof STAFF_FUNCTIONS)[number];

/**
 * Abreviation pour les en-tetes du tableau croise.
 *
 * Onze colonnes de « Inspecteur d'education » seraient illisibles ; le nom
 * complet reste en infobulle et sur la fiche de la fonction.
 */
const ROLE_SHORT: Record<RoleCode, string> = {
  SCHOOL_ADMIN: 'Fond.',
  DIRECTOR: 'Dir.',
  DEPUTY_DIRECTOR: 'D. adj.',
  CENSOR: 'Cens.',
  EDUCATION_INSPECTOR: 'Insp.',
  HEAD_SUPERVISOR: 'Surv. gén.',
  SUPERVISOR: 'Éduc.',
  SECRETARY: 'Secr.',
  IT_ADMIN: 'Info.',
  ACCOUNTANT: 'Compt.',
  TEACHER: 'Ens.',
  PARENT: 'Parent',
  STUDENT: 'Élève',
};

export function roleShort(code: RoleCode): string {
  return ROLE_SHORT[code] ?? code;
}

export function roleLabel(code: RoleCode): string {
  return ROLE_LABELS[code] ?? code;
}
