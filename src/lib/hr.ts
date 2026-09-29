/**
 * Vocabulaire des ressources humaines partagé par les fiches Personnel et
 * Enseignants : types de contrat et diplômes. Les codes sont stockés en base
 * (`employment_type` est une énumération ; `diploma` est un texte libre côté base,
 * la liste ci-dessous en est le vocabulaire proposé).
 */

export const EMPLOYMENT_OPTIONS = [
  { code: 'PERMANENT', label: 'Permanent', hint: 'Titulaire de son poste' },
  { code: 'CONTRACT', label: 'Contractuel', hint: 'Contrat à durée déterminée' },
  { code: 'HOURLY', label: 'Vacataire', hint: 'Payé aux heures données' },
  { code: 'INTERN', label: 'Stagiaire', hint: 'En stage ou en formation' },
  { code: 'OTHER', label: 'Autre', hint: 'Autre situation' },
] as const;

export type EmploymentCode = (typeof EMPLOYMENT_OPTIONS)[number]['code'];

export const DIPLOMAS = [
  { code: 'CEPE', label: 'CEPE' },
  { code: 'BEPC', label: 'BEPC' },
  { code: 'BAC', label: 'Baccalauréat' },
  { code: 'BTS', label: 'BTS' },
  { code: 'DUT', label: 'DUT' },
  { code: 'LICENCE', label: 'Licence' },
  { code: 'MASTER', label: 'Master' },
  { code: 'DOCTORAT', label: 'Doctorat' },
  { code: 'CAFOP', label: 'CAFOP' },
  { code: 'CAPES', label: 'CAPES' },
  { code: 'AUTRE', label: 'Autre' },
] as const;

export const DIPLOMA_CODES = DIPLOMAS.map((d) => d.code) as [string, ...string[]];

export function employmentLabel(code: string | null | undefined): string {
  return EMPLOYMENT_OPTIONS.find((o) => o.code === code)?.label ?? '—';
}

export function diplomaLabel(code: string | null | undefined): string {
  return DIPLOMAS.find((d) => d.code === code)?.label ?? (code ? code : '—');
}
