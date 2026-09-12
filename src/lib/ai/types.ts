/** Contexte d'une proposition d'appréciation (données déjà autorisées). */
export type AppreciationInput = {
  studentName: string;
  generalAverage: number | null;
  classAverage: number | null;
  rank: number | null;
  classSize: number | null;
  passingScore: number;
  absences: number;
  lateness: number;
  subjects: { name: string; average: number | null; classAverage: number | null }[];
};

export type AiText = { text: string; source: 'ai' | 'rule' };
