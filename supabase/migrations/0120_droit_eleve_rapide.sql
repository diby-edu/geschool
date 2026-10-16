-- =============================================================================
-- 0120 — can_see_student : d'abord l'appartenance à l'école (rapide)
-- =============================================================================
-- can_see_student protège les élèves, inscriptions, présences, justificatifs,
-- bulletins, notes… Il est évalué LIGNE PAR LIGNE. Pour une ligne d'une école
-- dont on n'est pas membre, il faisait quand même ses quatre recherches
-- (droit, parent, élève, enseignant) : ~7 ms par élève. Mesuré le 2026-10-16
-- avec deux écoles en base (5 600 élèves) : la liste des élèves du directeur
-- prenait 12,7 s et dépassait le délai de 8 s.
--
-- Même résultat qu'avant pour toute personne qui utilise l'application : sans
-- appartenance ACTIVE, l'établissement est introuvable (app_context) — parents
-- et enseignants y sont membres. Le CASE impose l'ordre : l'appartenance est
-- vérifiée avant le reste, et le reste n'est évalué que pour SON école.
create or replace function app.can_see_student(p_school uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select case
    when app.is_platform_admin() then true
    when not app.is_member_of(p_school) then false
    else app.has_permission(p_school, 'students.view')
      or app.is_guardian_of(p_student)
      or app.is_self_student(p_student)
      or app.teaches_student(p_student)
  end;
$$;
