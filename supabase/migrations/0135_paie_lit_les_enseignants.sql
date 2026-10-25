-- =============================================================================
-- 0135 — Le droit « paie » suffit pour lire les fiches d'enseignants
-- =============================================================================
-- Depuis 0132, le Comptable a la paie (teachers.payroll) sans la liste des
-- enseignants (teachers.view). La page « Heures faites et paie » recevait bien
-- les heures des 170 enseignants de l'école de démo, mais la lecture de leurs
-- fiches (nom, contrat, quota, taux) rendait 0 ligne : la page affichait
-- « Aucun cours ce mois-ci », alors que 6 311 appels étaient faits en octobre.
-- Constaté le 2026-10-25.
--
-- Même règle qu'avant, avec teachers.payroll en plus.
drop policy teachers_select on teachers;
create policy teachers_select on teachers for select to authenticated
using (
  app.is_platform_admin()
  or user_id = auth.uid()
  or app.has_any_permission(
    school_id,
    array['teachers.view', 'assignments.view', 'classes.view', 'schedule.view_all', 'attendance.view_all', 'teachers.payroll']
  )
);
