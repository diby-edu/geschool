import { normalizeHeader } from '@/lib/csv-parse';
import { DIPLOMAS } from '@/lib/hr';
import { STAFF_FUNCTIONS, type StaffFunction } from '@/lib/permissions/roles';

/**
 * Conversion des valeurs saisies à la main dans un tableur vers les codes de
 * l'application. Tolérantes (accents, casse, abréviations courantes) ; une
 * valeur non reconnue renvoie `undefined`, et la ligne est alors signalée.
 */

const norm = normalizeHeader;

/** jj/mm/aaaa, j/m/aaaa, jj-mm-aaaa, jj.mm.aaaa, aaaa-mm-jj ou numéro de série Excel -> aaaa-mm-jj. */
export function parseDate(raw: string): string | undefined {
  const v = raw.trim();
  if (v === '') return '';
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if (/^\d{4,5}$/.test(v)) {
    // Date restée au format « nombre » d'Excel (jours depuis le 30/12/1899)
    const date = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000);
    return date.toISOString().slice(0, 10);
  } else {
    return undefined;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return date.toISOString().slice(0, 10);
}

export function parseBool(raw: string, fallback: boolean): boolean | undefined {
  const v = norm(raw);
  if (v === '') return fallback;
  if (['oui', 'o', 'x', '1', 'vrai', 'yes', 'y', 'actif', 'active', 'accessible'].includes(v)) return true;
  if (['non', 'n', '0', 'faux', 'no', 'inactif', 'inactive'].includes(v)) return false;
  return undefined;
}

export function parseGender(raw: string): 'M' | 'F' | '' | undefined {
  const v = norm(raw);
  if (v === '') return '';
  if (['m', 'masculin', 'homme', 'h', 'garcon', 'male'].includes(v)) return 'M';
  if (['f', 'feminin', 'femme', 'fille', 'female'].includes(v)) return 'F';
  return undefined;
}

/**
 * « Redoublant » : OUI / NON, et tout ce qu'un secretariat ecrit a la place.
 * Vide = NON : une colonne laissee blanche veut dire « ne redouble pas », pas
 * « je ne sais pas ».
 */
export function parseYesNo(raw: string): boolean | undefined {
  const v = norm(raw);
  if (v === '') return false;
  if (['oui', 'o', 'yes', 'y', 'vrai', 'true', '1', 'x'].includes(v)) return true;
  if (['non', 'n', 'no', 'faux', 'false', '0', '-'].includes(v)) return false;
  return undefined;
}

/** « Affecté » / « Non affecté » — le statut d'affectation par l'Etat. */
export function parseAssigned(raw: string): '1' | '0' | undefined {
  const v = norm(raw);
  if (['affecte', 'affectee', 'affect', 'oui', 'o', 'a'].includes(v)) return '1';
  if (['non affecte', 'nonaffecte', 'non affectee', 'non', 'n', 'na', 'non-affecte'].includes(v)) return '0';
  return undefined;
}

const EMPLOYMENT: Record<string, 'PERMANENT' | 'CONTRACT' | 'HOURLY' | 'INTERN' | 'OTHER'> = {
  permanent: 'PERMANENT', titulaire: 'PERMANENT', fonctionnaire: 'PERMANENT',
  contractuel: 'CONTRACT', contrat: 'CONTRACT', cdd: 'CONTRACT', cdi: 'CONTRACT',
  vacataire: 'HOURLY', vacation: 'HOURLY', vacataires: 'HOURLY',
  stagiaire: 'INTERN', stage: 'INTERN',
  autre: 'OTHER',
};

export function parseEmployment(raw: string): 'PERMANENT' | 'CONTRACT' | 'HOURLY' | 'INTERN' | 'OTHER' | undefined {
  const v = norm(raw);
  if (v === '') return undefined;
  const code = raw.trim().toUpperCase();
  if (['PERMANENT', 'CONTRACT', 'HOURLY', 'INTERN', 'OTHER'].includes(code)) return code as never;
  return EMPLOYMENT[v] ?? EMPLOYMENT[v.split(' ')[0]!];
}

export function parseTeacherStatus(raw: string): 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'LEFT' | undefined {
  const v = norm(raw);
  if (v === '' || v === 'actif' || v === 'active' || v === 'en poste') return 'ACTIVE';
  if (v.includes('conge')) return 'ON_LEAVE';
  if (v.startsWith('suspendu')) return 'SUSPENDED';
  if (v === 'parti' || v === 'partie' || v.includes('depart')) return 'LEFT';
  return undefined;
}

export function parseDiploma(raw: string): string | undefined {
  const v = norm(raw);
  if (v === '') return '';
  const found = DIPLOMAS.find((d) => norm(d.code) === v || norm(d.label) === v || (v === 'bac' && d.code === 'BAC'));
  return found?.code;
}

const FUNCTION_LABELS: Record<string, StaffFunction> = {
  directeur: 'DIRECTOR', 'directeur des etudes': 'DIRECTOR', directrice: 'DIRECTOR',
  'directeur adjoint': 'DEPUTY_DIRECTOR', 'directrice adjointe': 'DEPUTY_DIRECTOR', adjoint: 'DEPUTY_DIRECTOR',
  censeur: 'CENSOR',
  'inspecteur d education': 'EDUCATION_INSPECTOR', 'inspecteur': 'EDUCATION_INSPECTOR', 'inspectrice d education': 'EDUCATION_INSPECTOR',
  'surveillant general': 'HEAD_SUPERVISOR', 'surveillante generale': 'HEAD_SUPERVISOR',
  educateur: 'SUPERVISOR', educatrice: 'SUPERVISOR', surveillant: 'SUPERVISOR',
  secretaire: 'SECRETARY',
  informaticien: 'IT_ADMIN', informaticienne: 'IT_ADMIN', informatique: 'IT_ADMIN',
};

/** « Directeur, Censeur » ou « Secrétaire / Informaticien » -> codes ; `undefined` si l'une est inconnue. */
export function parseFunctions(raw: string): StaffFunction[] | undefined {
  const parts = raw
    .split(/[,;/+]| et /i)
    .map((p) => norm(p))
    .filter(Boolean);
  const out: StaffFunction[] = [];
  for (const p of parts) {
    const code = (STAFF_FUNCTIONS as readonly string[]).includes(p.toUpperCase().replace(/ /g, '_'))
      ? (p.toUpperCase().replace(/ /g, '_') as StaffFunction)
      : FUNCTION_LABELS[p];
    if (!code) return undefined;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

const RELATION: Record<string, 'FATHER' | 'MOTHER' | 'TUTOR' | 'LEGAL_GUARDIAN' | 'SIBLING' | 'OTHER'> = {
  pere: 'FATHER', papa: 'FATHER', father: 'FATHER',
  mere: 'MOTHER', maman: 'MOTHER', mother: 'MOTHER',
  tuteur: 'TUTOR', tutrice: 'TUTOR',
  'tuteur legal': 'LEGAL_GUARDIAN', 'tutrice legale': 'LEGAL_GUARDIAN', 'responsable legal': 'LEGAL_GUARDIAN',
  frere: 'SIBLING', soeur: 'SIBLING', 'frere soeur': 'SIBLING',
  oncle: 'OTHER', tante: 'OTHER', autre: 'OTHER',
};

export function parseRelationship(raw: string): 'FATHER' | 'MOTHER' | 'TUTOR' | 'LEGAL_GUARDIAN' | 'SIBLING' | 'OTHER' {
  const v = norm(raw.replace(/œ/g, 'oe'));
  return RELATION[v] ?? 'TUTOR';
}

/** Entier positif ou nul ; vide -> `fallback`. */
export function parseCount(raw: string, fallback: number): number | undefined {
  const v = raw.trim().replace(/\s/g, '');
  if (v === '') return fallback;
  if (!/^\d+$/.test(v)) return undefined;
  return Number(v);
}

/** Code comparable : majuscules, sans espaces ni accents (« 6ème 1 » -> « 6EME1 »). */
export function normCode(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** « KOFFI Jean Marc » -> nom « KOFFI », prénoms « Jean Marc » (nom = premier mot). */
export function splitFullName(raw: string): { lastName: string; firstName: string } {
  const [last = '', ...rest] = raw.trim().split(/\s+/);
  return { lastName: last, firstName: rest.join(' ') };
}
