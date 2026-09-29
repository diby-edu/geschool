import { z } from 'zod';

/**
 * Affectation pedagogique (teaching_assignments, docs/DATABASE.md §7) :
 * un enseignant enseigne une matiere a une classe, pour un volume donne.
 * Le cas « deux profs sur la meme matiere/classe » se traduit par deux
 * affectations distinctes (§31).
 */
export const assignmentSchema = z.object({
  teacherId: z.uuid('Enseignant requis.'),
  subjectId: z.uuid('Matière requise.'),
  classId: z.uuid('Classe requise.'),
  weeklyMinutes: z.coerce.number({ error: 'Volume invalide.' }).int().min(0).max(3000).default(0),
});

export type AssignmentInput = z.infer<typeof assignmentSchema>;

/**
 * Affectation a un GROUPE plutot qu'a une classe entiere : le professeur
 * d'allemand n'enseigne pas a toute la 4eme, seulement aux germanistes.
 * La table le prevoyait depuis l'origine (teaching_assignments.group_id) ;
 * aucun ecran ne savait l'ecrire.
 */
export const groupAssignmentSchema = z.object({
  teacherId: z.uuid('Enseignant requis.'),
  subjectId: z.uuid('Matière requise.'),
  weeklyMinutes: z.coerce.number({ error: 'Volume invalide.' }).int().min(0).max(3000).default(0),
});

export type GroupAssignmentInput = z.infer<typeof groupAssignmentSchema>;
