export const YEAR_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Active',
  CLOSED: 'Cloturee',
  ARCHIVED: 'Archivee',
};

export const PERIOD_KIND_LABEL: Record<string, string> = {
  TERM: 'Trimestre',
  SEMESTER: 'Semestre',
  QUARTER: 'Quadrimestre',
};

export const CALENDAR_KIND_LABEL: Record<string, string> = {
  VACATION: 'Congés',
  HOLIDAY: 'Congés',
  PUBLIC_HOLIDAY: 'Jour férié',
  CLOSURE: 'Fermeture',
  EXAM: 'Examens',
  EVENT: 'Événement',
};

export function formatDate(iso: string): string {
  // iso: YYYY-MM-DD -> DD/MM/YYYY sans dependance a un fuseau
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** « lundi 14 septembre 2026 » (date seule, sans dépendance au fuseau). */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}

/** Nombre de jours d'une plage, bornes incluses. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000) + 1;
}

/** Où en est une période aujourd'hui. */
export function periodPhase(startsOn: string, endsOn: string, today: string): 'upcoming' | 'current' | 'past' {
  if (today < startsOn) return 'upcoming';
  if (today > endsOn) return 'past';
  return 'current';
}
