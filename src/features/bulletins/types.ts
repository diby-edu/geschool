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
};

export type BulletinItem = {
  subject: string;
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
  items: BulletinItem[];
};
