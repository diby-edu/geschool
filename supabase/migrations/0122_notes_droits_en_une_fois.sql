-- =============================================================================
-- 0122 — Lecture des notes : les derniers contrôles ligne par ligne, en une fois
-- =============================================================================
-- Suite de 0121. La règle de lecture de grades appelait encore, pour CHAQUE
-- note, owns_assessment(), has_permission() et assessment_is_published().
-- Mesuré le 2026-10-16 : 20 s pour un enseignant (27 600 notes visibles) et
-- 22 s pour un parent (88 notes visibles) — au-delà du délai de 8 s.
--
--   owns_assessment(A)            -> A IN (SELECT app.my_owned_assessments())
--   has_permission(S, 'grades.view') -> S IN (SELECT app.my_schools_with('grades.view'))
--   assessment_is_published(A)    -> A IN (SELECT app.my_published_assessments())
--
-- Équivalence : my_owned_assessments = les évaluations dont je suis
-- l'enseignant (exactement owns_assessment). my_published_assessments ne
-- garde que les écoles dont je suis membre actif : ce test est toujours
-- combiné (ET) à la visibilité de l'élève, qui exige déjà cette appartenance.
-- =============================================================================

create or replace function app.my_owned_assessments()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select a.id
  from public.assessments a
  join public.teachers t on t.id = a.teacher_id
  where t.user_id = auth.uid() and t.deleted_at is null;
$$;

create or replace function app.my_published_assessments()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select a.id
  from public.assessments a
  where a.status = 'PUBLISHED'
    and a.school_id in (
      select m.school_id from public.school_memberships m
      where m.user_id = auth.uid() and m.status = 'ACTIVE'
    );
$$;

revoke all on function app.my_owned_assessments() from public, anon;
revoke all on function app.my_published_assessments() from public, anon;
grant execute on function app.my_owned_assessments() to authenticated, service_role;
grant execute on function app.my_published_assessments() to authenticated, service_role;

do $$
declare
  v_qual text;
begin
  select qual into v_qual from pg_policies
  where schemaname = 'public' and tablename = 'grades' and policyname = 'grades_select';

  v_qual := replace(v_qual, 'app.owns_assessment(assessment_id)',
    '(assessment_id IN (SELECT app.my_owned_assessments()))');
  v_qual := replace(v_qual, 'app.has_permission(school_id, ''grades.view''::text)',
    '(school_id IN (SELECT app.my_schools_with(''grades.view''::text)))');
  v_qual := replace(v_qual, 'app.assessment_is_published(assessment_id)',
    '(assessment_id IN (SELECT app.my_published_assessments()))');

  execute format('alter policy grades_select on public.grades using (%s)', v_qual);
end;
$$;
