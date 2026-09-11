/**
 * Codes des roles systeme (docs/RBAC.md §1). Ils correspondent exactement aux
 * `roles.code` du seed (migration 0028). La liste est fermee : un role
 * d'etablissement clone porte l'un de ces codes.
 */
export const ROLE_CODES = [
  'SCHOOL_ADMIN',
  'DIRECTOR',
  'CENSOR',
  'SECRETARY',
  'SUPERVISOR',
  'ACCOUNTANT',
  'TEACHER',
  'PARENT',
  'STUDENT',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

/**
 * Espaces de l'application. Une seule application, plusieurs espaces selon le
 * role (ARCHITECTURE.md §3).
 */
export type Space = 'school' | 'teacher' | 'parent' | 'student';

/**
 * Espace vers lequel diriger un utilisateur, du plus privilegie au moins
 * privilegie. Le personnel administratif atterrit dans l'espace etablissement ;
 * un enseignant pur dans l'espace enseignant ; etc.
 */
export function defaultSpaceFor(roles: readonly RoleCode[]): Space {
  const staff: RoleCode[] = ['SCHOOL_ADMIN', 'DIRECTOR', 'CENSOR', 'SECRETARY', 'SUPERVISOR', 'ACCOUNTANT'];
  if (roles.some((r) => staff.includes(r))) return 'school';
  if (roles.includes('TEACHER')) return 'teacher';
  if (roles.includes('PARENT')) return 'parent';
  if (roles.includes('STUDENT')) return 'student';
  // Aucun role connu : par prudence, l'espace le plus restreint
  return 'student';
}

const ROLE_LABELS: Record<RoleCode, string> = {
  SCHOOL_ADMIN: 'Administrateur',
  DIRECTOR: 'Directeur',
  CENSOR: 'Censeur',
  SECRETARY: 'Secretaire',
  SUPERVISOR: 'Educateur',
  ACCOUNTANT: 'Comptable',
  TEACHER: 'Enseignant',
  PARENT: 'Parent',
  STUDENT: 'Eleve',
};

export function roleLabel(code: RoleCode): string {
  return ROLE_LABELS[code] ?? code;
}
