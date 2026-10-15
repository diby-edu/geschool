/** Une classe sur la page des professeurs principaux. */
export type HeadTeacherRow = {
  classId: string;
  className: string;
  level: string | null;
  currentId: string | null;
  /** L'enseignant qui a le plus d'heures dans la classe : la suggestion. */
  suggestionId: string | null;
  /** Enseignants de la classe, du plus d'heures au moins. */
  classTeacherIds: string[];
};
