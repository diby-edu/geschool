-- =============================================================================
-- 0038 — Moyennes « a tout moment » pour l'enseignant + appel enseignant
-- =============================================================================
--
-- Deux besoins distincts du tableau de bord enseignant (module « Notes &
-- Evaluations » et module « Presence »), aucun changement de permission :
--
-- 1. Un enseignant doit pouvoir calculer la moyenne et le classement de SA
--    matiere sur une classe A TOUT MOMENT, y compris avec des evaluations en
--    brouillon (DRAFT/OPEN). La cloture (CLOSED) reste un geste reserve a
--    l'administration : elle gele la saisie, elle ne conditionne plus le
--    calcul. Les fonctions existantes (0022) filtraient en dur sur
--    ('CLOSED', 'PUBLISHED') — necessaire pour les BULLETINS OFFICIELS
--    (report_cards, generateForClass), qui continuent d'utiliser ce
--    comportement par defaut, inchange. On ajoute un parametre optionnel en
--    fin de liste (retrocompatible : tout appelant existant garde le
--    comportement actuel sans le passer).
--
-- 2. app.can_take_attendance (0015) autorise deja, cote RLS, l'enseignant
--    d'une seance a faire son appel — mais aucune passerelle publique
--    n'existe pour l'appeler depuis supabase.rpc() (meme cause que 0032/0033/
--    0036/0037 : PostgREST ne voit que le schema public). La couche
--    applicative (applyAttendanceSave / submitRegister) exigeait a tort la
--    permission generale 'attendance.create', que le role TEACHER ne possede
--    jamais par conception (RBAC.md §... : son perimetre est derive, pas
--    accorde). Sans cette passerelle, un enseignant simple ne pouvait faire
--    AUCUN appel.

-- -----------------------------------------------------------------------------
-- 1. Moyenne d'un eleve dans une matiere : parametre p_include_draft
-- -----------------------------------------------------------------------------

create or replace function app.student_subject_average(
  p_student               uuid,
  p_subject               uuid,
  p_period                uuid,
  p_scale_max             numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals              smallint default 2,
  p_rounding              rounding_mode default 'HALF_UP',
  p_include_draft         boolean default false
)
returns numeric
language sql
stable
as $$
  with eligible as (
    select g.score,
           a.max_score,
           a.coefficient,
           g.is_absent
    from grades g
    join assessments a on a.id = g.assessment_id
    join assessment_types at2 on at2.id = a.assessment_type_id
    where g.student_id = p_student
      and a.subject_id = p_subject
      and a.academic_period_id = p_period
      and (p_include_draft or a.status in ('CLOSED', 'PUBLISHED'))
      and at2.counts_in_average
      and not g.is_excluded_from_average
      and (
        (not g.is_absent and g.score is not null)
        or (g.is_absent and not g.is_excused and p_absent_counts_as_zero)
      )
  )
  select app.round_score(
           sum(coalesce(case when is_absent then 0 else score end, 0) / max_score * coefficient)
             / nullif(sum(coefficient), 0) * p_scale_max,
           p_decimals,
           p_rounding
         )
  from eligible;
$$;

grant execute on function
  app.student_subject_average(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean)
to authenticated, service_role;

create or replace function public.student_subject_average(
  p_student uuid, p_subject uuid, p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP',
  p_include_draft boolean default false
)
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select app.student_subject_average(
    p_student, p_subject, p_period, p_scale_max,
    p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft
  );
$$;

grant execute on function
  public.student_subject_average(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Moyennes d'une classe par matiere (0037) : meme parametre, propage
-- -----------------------------------------------------------------------------

create or replace function app.class_subject_averages(
  p_class   uuid,
  p_period  uuid,
  p_subject uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP',
  p_include_draft boolean default false
)
returns table (student_id uuid, average numeric)
language sql
stable
as $$
  select se.student_id,
         app.student_subject_average(
           se.student_id, p_subject, p_period,
           p_scale_max, p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft
         ) as average
  from student_enrollments se
  join academic_periods ap on ap.id = p_period
  where se.class_id = p_class
    and se.academic_year_id = ap.academic_year_id
    and se.status = 'ENROLLED';
$$;

grant execute on function
  app.class_subject_averages(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean)
to authenticated, service_role;

create or replace function public.class_subject_averages(
  p_class uuid, p_period uuid, p_subject uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP',
  p_include_draft boolean default false
)
returns table (student_id uuid, average numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select * from app.class_subject_averages(
    p_class, p_period, p_subject, p_scale_max, p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft
  );
$$;

grant execute on function
  public.class_subject_averages(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Passerelle publique pour app.can_take_attendance (0015)
-- -----------------------------------------------------------------------------

create or replace function public.can_take_attendance(p_school uuid, p_occurrence uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select app.can_take_attendance(p_school, p_occurrence);
$$;

grant execute on function public.can_take_attendance(uuid, uuid) to authenticated, service_role;
