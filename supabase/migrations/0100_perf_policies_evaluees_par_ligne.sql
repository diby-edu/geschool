-- =============================================================================
-- 0100 — Les gardes generales ne se rejouent plus a chaque ligne
--
-- 0099 a corrige `student_enrollments` ; le defaut etait un PATRON, pas un
-- accident. Une policy dont la condition depend d'une colonne de la ligne est
-- rejouee pour CHAQUE ligne lue, et chacune de ces fonctions fait plusieurs
-- sous-requetes. Mesures avant, sur une ecole de 800 eleves :
--
--   students              1 214 ms pour compter 800 eleves
--   session_occurrences     771 ms pour une semaine de creneaux
--
-- Correctif, partout le meme : les gardes qui NE dependent PAS de la ligne
-- passent devant, dans un `(select ...)` ou un `in (select ...)` que Postgres
-- evalue UNE SEULE FOIS (InitPlan). La garde fine reste derriere, pour le
-- parent, l'eleve et l'enseignant.
--
-- AUCUN ACCES N'EST MODIFIE : `app.can_read(ecole, droit)` vaut exactement
-- `is_platform_admin() OR (is_member_of AND has_permission)`, et
-- `my_schools_with(droit)` / `member_school_ids()` interrogent les memes
-- tables aux memes conditions. Verifie profil par profil, avant et apres.
-- =============================================================================

-- --- Eleves -----------------------------------------------------------------
drop policy students_select on students;
create policy students_select on students for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('students.view'))
  or app.can_see_student(school_id, id)
);

-- --- Creneaux dates (la plus grosse table du module emploi du temps) --------
drop policy occurrences_select on session_occurrences;
create policy occurrences_select on session_occurrences for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('schedule.view_all'))
  or app.can_see_session(school_id, schedule_session_id)
);

-- --- Parents et rattachements ----------------------------------------------
drop policy student_guardians_select on student_guardians;
create policy student_guardians_select on student_guardians for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('guardians.view'))
  or app.is_guardian_of(student_id)
  or app.is_self_student(student_id)
);

drop policy guardians_select on guardians;
create policy guardians_select on guardians for select to authenticated
using (
  user_id = (select auth.uid())
  or (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('guardians.view'))
);

-- --- Besoins d'enseignement (lus en masse par la generation d'emploi du temps)
drop policy requirements_select on teaching_requirements;
create policy requirements_select on teaching_requirements for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('schedule.view'))
);

drop policy requirement_targets_select on teaching_requirement_targets;
create policy requirement_targets_select on teaching_requirement_targets for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('schedule.view'))
);

drop policy requirement_teachers_select on teaching_requirement_teachers;
create policy requirement_teachers_select on teaching_requirement_teachers for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('schedule.view'))
);

-- --- Affectations ------------------------------------------------------------
drop policy assignments_select on teaching_assignments;
create policy assignments_select on teaching_assignments for select to authenticated
using (
  (select app.is_platform_admin())
  -- Fonction SANS argument : Postgres ne la rejoue pas par ligne.
  or school_id = any (app.member_school_ids())
);
