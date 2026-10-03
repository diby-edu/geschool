/** Types d'affichage des bulletins (sans accès base : utilisables en composant). */

export const BULLETIN_STATUS: Record<string, string> = {
  DRAFT: 'Brouillon',
  GENERATED: 'Généré',
  VALIDATED: 'Validé',
  PUBLISHED: 'Publié',
};

export type BulletinRow = {
  id: string;
  student: string;
  matricule: string;
  general_average: number | null;
  rank: number | null;
  status: string;
  /** Signé par le directeur (étape entre la validation et la publication). */
  signed: boolean;
};

/** État affiché : « Validé » se précise selon la signature. */
export function bulletinStateLabel(status: string, signed: boolean): string {
  if (status === 'VALIDATED') return signed ? 'Validé · signé' : 'Validé · à signer';
  return BULLETIN_STATUS[status] ?? status;
}

export type BulletinItem = {
  subject: string;
  /** Nom de l'enseignant, figé à la génération. */
  teacher: string | null;
  /** Le mot du palier : « Bien », « Passable »… jamais une phrase. */
  appreciation: string | null;
  coefficient: number;
  average: number | null;
  weighted: number | null;
  class_average: number | null;
  class_min: number | null;
  class_max: number | null;
  rank: number | null;
};

export type BulletinDetail = {
  id: string;
  status: string;
  student: string;
  matricule: string;
  klass: string;
  period: string;
  school: string;
  general_average: number | null;
  rank: number | null;
  class_size: number | null;
  class_average: number | null;
  absences: number;
  lateness: number;
  head_teacher_comment: string | null;
  council_comment: string | null;
  /** Mention calculée, et l'additif libre que le conseil ajoute à côté. */
  distinction_label: string | null;
  distinction_note: string | null;
  /** Renseignés sur le SEUL dernier bulletin de l'année. */
  annual_average: number | null;
  annual_rank: number | null;
  decision_label: string | null;
  /** Nombre de rectifications APRÈS remise aux familles. 0 = document d'origine. */
  revision: number;
  /**
   * Les périodes DÉJÀ passées de la même année, pour le rappel imprimé.
   * Vide sur le premier bulletin : il n'y a rien à rappeler.
   */
  previous: { name: string; average: number | null; rank: number | null }[];
  items: BulletinItem[];
};
