-- =============================================================================
-- 0123 — Lecture des évaluations : contrôles calculés une fois par requête
-- =============================================================================
-- Suite de 0121-0122. La règle de lecture de assessments appelait, pour CHAQUE
-- évaluation, owns_assessment(), teaches_class(), teaches_group() et
-- assessment_concerns_my_student() (qui recalcule les enfants du parent à
-- chaque ligne). Mesuré le 2026-10-16 : 33 s pour qu'un parent lise ses
-- 88 évaluations ; les moyennes de « Mes notes », qui lisent cette table,
-- prenaient 33 à 38 s.
--
--   owns_assessment(id)          -> id IN (SELECT app.my_owned_assessments())   [0122]
--   teaches_class(class_id)      -> class_id IN (SELECT app.my_taught_classes())
--   teaches_group(group_id)      -> group_id IN (SELECT app.my_taught_groups())
--   assessment_concerns_my_student(school_id, id)
--                                -> id IN (SELECT app.my_children_assessments())
--
-- Chaque fonction ci-dessous reprend exactement la recherche de la fonction
-- qu'elle remplace, pour l'ensemble des lignes au lieu d'une seule. Seule la
-- règle de LECTURE change ; les règles d'écriture (peu de lignes) restent.
-- =============================================================================

-- teaches_class : une affectation active dans la classe, ou professeur principal.
create or replace function app.my_taught_classes()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select ta.class_id
  from public.teaching_assignments ta
  join public.teachers t on t.id = ta.teacher_id
  where ta.class_id is not null and ta.status = 'ACTIVE'
    and t.user_id = auth.uid() and t.deleted_at is null
  union
  select c.id
  from public.classes c
  join public.teachers t on t.id = c.head_teacher_id
  where t.user_id = auth.uid() and t.deleted_at is null;
$$;

-- teaches_group : une affectation active dans le groupe.
create or replace function app.my_taught_groups()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select ta.group_id
  from public.teaching_assignments ta
  join public.teachers t on t.id = ta.teacher_id
  where ta.group_id is not null and ta.status = 'ACTIVE'
    and t.user_id = auth.uid() and t.deleted_at is null;
$$;

-- assessment_concerns_my_student : une note d'un de mes enfants (ou de moi,
-- élève) dans l'évaluation, élève de la même école que l'évaluation.
create or replace function app.my_children_assessments()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  with mine as (
    select sg.student_id, sg.school_id
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where g.user_id = auth.uid() and g.status = 'ACTIVE'
    union
    select s.id, s.school_id
    from public.students s
    where s.user_id = auth.uid() and s.deleted_at is null
  )
  select distinct g.assessment_id
  from mine
  join public.grades g on g.student_id = mine.student_id
  join public.assessments a on a.id = g.assessment_id and a.school_id = mine.school_id;
$$;

revoke all on function app.my_taught_classes() from public, anon;
revoke all on function app.my_taught_groups() from public, anon;
revoke all on function app.my_children_assessments() from public, anon;
grant execute on function app.my_taught_classes() to authenticated, service_role;
grant execute on function app.my_taught_groups() to authenticated, service_role;
grant execute on function app.my_children_assessments() to authenticated, service_role;

do $$
declare
  v_qual text;
begin
  select qual into v_qual from pg_policies
  where schemaname = 'public' and tablename = 'assessments' and policyname = 'assessments_select';

  v_qual := replace(v_qual, 'app.owns_assessment(id)',
    '(id IN (SELECT app.my_owned_assessments()))');
  v_qual := replace(v_qual, 'app.teaches_class(class_id)',
    '(class_id IN (SELECT app.my_taught_classes()))');
  v_qual := replace(v_qual, 'app.teaches_group(group_id)',
    '(group_id IN (SELECT app.my_taught_groups()))');
  v_qual := replace(v_qual, 'app.assessment_concerns_my_student(school_id, id)',
    '(id IN (SELECT app.my_children_assessments()))');

  execute format('alter policy assessments_select on public.assessments using (%s)', v_qual);
end;
$$;
