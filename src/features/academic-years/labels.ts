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

export function formatDate(iso: string): string {
  // iso: YYYY-MM-DD -> DD/MM/YYYY sans dependance a un fuseau
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
