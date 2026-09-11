-- =============================================================================
-- 0022 — Calcul des moyennes et des rangs
-- =============================================================================
--
-- Ces fonctions sont en SECURITY INVOKER — le defaut — et non DEFINER.
-- La distinction est une frontiere de securite :
--
--   les fonctions de SECURITE renvoient un booleen et doivent contourner la
--   RLS pour eviter la recursion (migration 0005) ;
--
--   les fonctions de CALCUL renvoient des DONNEES et doivent au contraire
--   subir la RLS de l'appelant. En DEFINER, un parent obtiendrait la moyenne
--   de n'importe quel eleve en appelant directement la fonction.
--
-- Les regles metier (arrondi, traitement des absences, compensation) ne sont
-- pas lues ici depuis school_settings : elles arrivent en PARAMETRES. La
-- couche applicative lit la configuration et la transmet. Cela garde le SQL
-- testable isolement et evite d'analyser du jsonb dans une fonction chaude.

-- -----------------------------------------------------------------------------
-- Arrondi configurable
-- -----------------------------------------------------------------------------

create or replace function app.round_score(
  p_value    numeric,
  p_decimals smallint default 2,
  p_mode     rounding_mode default 'HALF_UP'
)
returns numeric
language sql
immutable
as $$
  select case
    when p_value is null then null
    when p_mode = 'NONE'            then p_value
    when p_mode = 'HALF_UP'         then round(p_value, p_decimals)
    when p_mode = 'NEAREST_HALF'    then round(p_value * 2) / 2
    when p_mode = 'NEAREST_QUARTER' then round(p_value * 4) / 4
    when p_mode = 'FLOOR'           then floor(p_value * power(10, p_decimals)) / power(10, p_decimals)
    when p_mode = 'CEIL'            then ceil(p_value * power(10, p_decimals)) / power(10, p_decimals)
    else round(p_value, p_decimals)
  end;
$$;

-- -----------------------------------------------------------------------------
-- Moyenne d'un eleve dans une matiere, sur une periode
--
-- Chaque note est ramenee a un ratio (score / bareme) avant ponderation :
-- sans cela, un devoir sur 10 et une composition sur 20 ne seraient pas
-- comparables, et la moyenne serait fausse sans que personne ne le voie.
--
-- p_absent_counts_as_zero : une absence non justifiee compte-t-elle comme 0,
-- ou est-elle simplement ecartee ? Les deux pratiques existent selon les
-- etablissements ; aucune n'est codee en dur.
-- -----------------------------------------------------------------------------

create or replace function app.student_subject_average(
  p_student               uuid,
  p_subject               uuid,
  p_period                uuid,
  p_scale_max             numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals              smallint default 2,
  p_rounding              rounding_mode default 'HALF_UP'
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
      and a.status in ('CLOSED', 'PUBLISHED')
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

-- -----------------------------------------------------------------------------
-- Moyenne generale d'un eleve sur une periode
--
-- Les moyennes par matiere sont ponderees par le coefficient du PROGRAMME du
-- niveau (level_subjects), pas par celui de la matiere : la meme matiere ne
-- pese pas pareil en 6e et en Terminale.
-- -----------------------------------------------------------------------------

create or replace function app.student_period_average(
  p_student               uuid,
  p_period                uuid,
  p_scale_max             numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals              smallint default 2,
  p_rounding              rounding_mode default 'HALF_UP'
)
returns numeric
language sql
stable
as $$
  with year_of_period as (
    select ap.academic_year_id from academic_periods ap where ap.id = p_period
  ),
  student_level as (
    select c.level_id
    from student_enrollments se
    join classes c on c.id = se.class_id
    join year_of_period y on y.academic_year_id = se.academic_year_id
    where se.student_id = p_student and se.status = 'ENROLLED'
    limit 1
  ),
  per_subject as (
    select ls.subject_id,
           ls.coefficient,
           -- Arrondi volontairement DESACTIVE a cet etage : arrondir chaque
           -- moyenne de matiere avant de les ponderer propagerait l'erreur
           -- d'arrondi dans la moyenne generale. On n'arrondit qu'une fois,
           -- au resultat final.
           app.student_subject_average(
             p_student, ls.subject_id, p_period,
             p_scale_max, p_absent_counts_as_zero,
             4::smallint, 'NONE'::rounding_mode
           ) as avg_value
    from level_subjects ls
    join student_level sl on sl.level_id = ls.level_id
  )
  select app.round_score(
           sum(avg_value * coefficient) / nullif(sum(coefficient), 0),
           p_decimals,
           p_rounding
         )
  from per_subject
  where avg_value is not null;
$$;

-- -----------------------------------------------------------------------------
-- Classement d'une classe sur une periode
--
-- Rang ex aequo au sens usuel : deux eleves a egalite partagent le rang, et le
-- suivant est decale. C'est rank() et non dense_rank() — un directeur attend
-- « 1, 2, 2, 4 », pas « 1, 2, 2, 3 ».
-- -----------------------------------------------------------------------------

create or replace function app.class_period_ranking(
  p_class                 uuid,
  p_period                uuid,
  p_scale_max             numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals              smallint default 2,
  p_rounding              rounding_mode default 'HALF_UP'
)
returns table (
  student_id      uuid,
  general_average numeric,
  rank_position   integer,
  class_size      integer
)
language sql
stable
as $$
  with year_of_period as (
    select ap.academic_year_id from academic_periods ap where ap.id = p_period
  ),
  averages as (
    select se.student_id,
           app.student_period_average(
             se.student_id, p_period, p_scale_max,
             p_absent_counts_as_zero, p_decimals, p_rounding
           ) as avg_value
    from student_enrollments se
    join year_of_period y on y.academic_year_id = se.academic_year_id
    where se.class_id = p_class and se.status = 'ENROLLED'
  )
  select a.student_id,
         a.avg_value,
         rank() over (order by a.avg_value desc nulls last)::integer,
         (select count(*)::integer from averages)
  from averages a
  order by 3;
$$;

grant execute on function
  app.round_score(numeric, smallint, rounding_mode),
  app.student_subject_average(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode),
  app.student_period_average(uuid, uuid, numeric, boolean, smallint, rounding_mode),
  app.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode)
to authenticated, service_role;
