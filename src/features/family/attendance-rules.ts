/**
 * Ce qu'une absence vaut aux yeux d'un parent : justifiee, ou pas.
 *
 * Deux chemins mènent a « justifiee », et il faut les deux :
 *
 * - l'appel lui-meme peut noter l'absence comme EXCUSED — l'eleve etait attendu
 *   ailleurs, l'enseignant le savait ;
 * - un justificatif depose apres coup (absence_justifications) couvre une
 *   PLAGE de dates, et ne vaut que s'il a ete APPROUVE. En attente ou refuse,
 *   l'absence reste non justifiee : annoncer l'inverse a un parent serait lui
 *   promettre une decision qui n'est pas prise.
 *
 * Un retard n'est jamais « justifie » : il se compte en minutes, pas en demi-
 * journees, et aucun justificatif ne le couvre dans le modele.
 */

export type Cover = { from: string; to: string; status: string };

export type AttendanceLike = {
  date: string;
  status: string;
  minutesLate: number;
};

export function isJustified(date: string, status: string, covers: readonly Cover[]): boolean {
  if (status === 'EXCUSED') return true;
  if (status !== 'ABSENT') return false;
  return covers.some((c) => c.status === 'APPROVED' && c.from <= date && date <= c.to);
}

export type AttendanceSummary = {
  absences: number;
  justifiees: number;
  retards: number;
  minutesLate: number;
};

/** Les quatre chiffres de l'en-tete, comptes sur les lignes affichees. */
export function summarize(rows: readonly (AttendanceLike & { justified: boolean })[]): AttendanceSummary {
  let absences = 0;
  let justifiees = 0;
  let retards = 0;
  let minutesLate = 0;

  for (const r of rows) {
    if (r.status === 'LATE') {
      retards += 1;
      minutesLate += r.minutesLate;
      continue;
    }
    absences += 1;
    if (r.justified) justifiees += 1;
  }

  return { absences, justifiees, retards, minutesLate };
}

export const FENETRES = ['30', '90', 'annee'] as const;
export type Fenetre = (typeof FENETRES)[number];

export const FENETRE_LABEL: Record<Fenetre, string> = {
  '30': '30 derniers jours',
  '90': '3 derniers mois',
  annee: 'Toute l’année',
};

export function parseFenetre(value: string | string[] | undefined): Fenetre {
  const v = (Array.isArray(value) ? value[0] : value) ?? '';
  return (FENETRES as readonly string[]).includes(v) ? (v as Fenetre) : '30';
}

/**
 * La date a partir de laquelle on regarde. « Toute l'année » part du debut de
 * l'annee scolaire quand on le connait — sinon de rien, et c'est tout
 * l'historique lisible qui s'affiche.
 */
export function debutFenetre(fenetre: Fenetre, today: string, yearStart: string | null): string {
  if (fenetre === 'annee') return yearStart ?? '0001-01-01';
  const jours = fenetre === '30' ? 30 : 90;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - jours);
  return d.toISOString().slice(0, 10);
}
