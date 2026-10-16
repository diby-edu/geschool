-- =============================================================================
-- 0124 — Nombre de notes saisies, pour une page d'évaluations seulement
-- =============================================================================
-- La liste des évaluations demandait `grades(count)` en même temps que le tri
-- et la pagination : la base comptait les notes des 10 848 évaluations de
-- l'année avant d'en garder 50 (3 ms chacune : ~32 s, délai dépassé). On lit
-- d'abord la page, puis on compte les notes de SES évaluations ici.
--
-- Fonction ordinaire (droits de l'appelant) : le compte respecte la règle de
-- lecture des notes, exactement comme `grades(count)`.
create or replace function public.assessment_grade_counts(p_ids uuid[])
returns table (assessment_id uuid, graded int)
language sql
stable
set search_path = public, pg_temp
as $$
  select g.assessment_id, count(*)::int
  from public.grades g
  where g.assessment_id = any (p_ids)
  group by g.assessment_id;
$$;

revoke all on function public.assessment_grade_counts(uuid[]) from public, anon;
grant execute on function public.assessment_grade_counts(uuid[]) to authenticated, service_role;
