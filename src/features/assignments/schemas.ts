import { z } from 'zod';

/**
 * Affectation pedagogique (teaching_assignments, docs/DATABASE.md §7) :
 * un enseignant enseigne une matiere a une classe, pour un volume donne.
 * Le cas « deux profs sur la meme matiere/classe » se traduit par deux
 * affectations distinctes (§31).
 */
export const assignmentSchema = z.object({
  teacherId: z.uuid('Enseignant requis.'),
  subjectId: z.uuid('Matiere requise.'),
  classId: z.uuid('Classe requise.'),
  weeklyMinutes: z.coerce.number({ error: 'Volume invalide.' }).int().min(0).max(3000).default(0),
});

export type AssignmentInput = z.infer<typeof assignmentSchema>;
