-- =============================================================================
-- 0099 — La lecture des inscriptions ne coute plus une seconde
--
-- Symptome : le tableau de bord de la direction affichait « 0 eleve » dans une
-- ecole qui en compte huit cents. Pas un calcul faux — une requete en ECHEC.
-- PostgREST repondait 500 au comptage, et comme un HEAD n'a pas de corps,
-- l'erreur arrivait sans message ; le code la prenait pour un zero.
--
-- Cause : `enrollments_select` appelle `app.can_see_student(school_id,
-- student_id)` LIGNE PAR LIGNE. La fonction depend de `student_id`, donc
-- Postgres la rejoue pour chacune des huit cents lignes, et chaque appel fait
-- jusqu'a cinq sous-requetes. Mesure : 1 167 ms pour un simple comptage. Le
-- tableau de bord en lance une vingtaine d'un coup : quelques-unes depassent
-- les 8 secondes accordees a `authenticated` et meurent.
--
-- Correctif : les deux gardes qui ne dependent PAS de la ligne passent devant,
-- dans un `(select ...)` que Postgres evalue UNE SEULE FOIS (InitPlan) :
--
--   1. administrateur de la plateforme ;
--   2. membre de l'ecole portant `students.view`.
--
-- `app.can_see_student` reste en dernier recours, pour le parent, l'eleve
-- lui-meme et l'enseignant : personne ne perd un acces, puisque les deux
-- raccourcis sont deja contenus dans la fonction — `my_schools_with` et
-- `has_permission` interrogent exactement les memes tables, aux memes
-- conditions.
--
-- Mesure apres : 5,7 ms au lieu de 1 167 ms, meme resultat.
-- =============================================================================

drop policy enrollments_select on student_enrollments;

create policy enrollments_select on student_enrollments for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('students.view'))
  or app.can_see_student(school_id, student_id)
);

comment on table student_enrollments is
  'Inscriptions d''un eleve par annee. Lecture : droit general evalue une fois (0099), perimetre individuel ensuite.';
