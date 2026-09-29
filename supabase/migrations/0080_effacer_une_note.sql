-- =============================================================================
-- 0080 — Un enseignant peut effacer une note qu'il vient de saisir
-- =============================================================================
--
-- La grille de saisie permet desormais d'effacer une note : vider le champ
-- supprime la ligne, au lieu de la laisser en base pour toujours. Mais la
-- policy `grades_delete` exigeait le droit `grades.delete`, que l'enseignant
-- n'a pas — la suppression ne touchait alors AUCUNE ligne, sans erreur, et la
-- note restait affichee au rechargement.
--
-- On aligne la suppression sur la modification, qui accordait deja ce pouvoir
-- au proprietaire de l'evaluation tant qu'elle n'est pas cloturee :
--
--   grades_update : can_write('grades.update')
--                   OR (owns_assessment AND assessment_is_open)
--
-- Corriger une note de 12 en 13 et effacer une note saisie par erreur sont le
-- meme geste ; il n'y avait aucune raison que l'un soit permis et l'autre non.
-- La cloture reste le verrou : une fois l'evaluation cloturee, seule
-- l'administration peut revenir dessus.

drop policy if exists grades_delete on public.grades;

create policy grades_delete on public.grades
for delete using (
  app.can_write(school_id, 'grades.delete')
  or (app.owns_assessment(assessment_id) and app.assessment_is_open(assessment_id))
);
