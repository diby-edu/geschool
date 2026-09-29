-- =============================================================================
-- 0077 — Les matières facultatives dans la moyenne générale
-- =============================================================================
--
-- La grille officielle compte des matieres facultatives (« 1 Fac » : la LV2 en
-- 1ere et Tle C et D), et l'ecran « Matieres par niveau » sait les marquer
-- (level_subjects.is_mandatory = false). Mais aucun calcul ne regardait ce
-- drapeau : une option ratee faisait BAISSER la moyenne generale exactement
-- comme une matiere obligatoire.
--
-- Les trois usages existent, l'etablissement choisit le sien (p_optional_mode,
-- reglage `grading.optionalMode`) :
--   COUNT   — elle compte comme les autres (comportement anterieur, defaut) ;
--   BONUS   — elle ne compte que si elle fait monter la moyenne ;
--   EXCLUDE — elle reste au bulletin, hors moyenne generale.
--
-- Mesure sur un eleve reel (Espagnol facultative, coefficient 1) :
--   note 4/20  -> COUNT 13,13 | BONUS 14,27 | EXCLUDE 14,27
--   note 19/20 -> COUNT 14,80 | BONUS 14,80 | EXCLUDE 14,27
--
-- Cette migration COMPLETE 0074, qui reste telle qu'elle a ete appliquee : une
-- migration deja passee ne se modifie pas, sinon la base et le depot divergent
-- en silence (c'est arrive ici : l'application envoyait deja p_optional_mode a
-- une fonction qui ne le connaissait pas, et l'ecran des moyennes repondait
-- 404).
--
-- Les signatures changent : on remplace, on ne surcharge pas — deux versions
-- coexistantes rendraient tout appel a deux arguments ambigu.

drop function if exists public.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean);
drop function if exists app.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean);
drop function if exists public.student_period_average(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean);
drop function if exists app.student_period_average(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean);

create or replace function app.student_period_average(
  p_student uuid,
  p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'::rounding_mode,
  p_include_draft boolean default false,
  p_optional_mode text default 'COUNT'
)
returns numeric
language sql
stable
as $function$
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
    select ls.coefficient,
           ls.is_mandatory,
           -- Arrondi volontairement DESACTIVE a cet etage : arrondir chaque
           -- moyenne de matiere avant de les ponderer propagerait l'erreur
           -- d'arrondi dans la moyenne generale. On n'arrondit qu'une fois,
           -- au resultat final.
           app.student_subject_average(
             p_student, ls.subject_id, p_period,
             p_scale_max, p_absent_counts_as_zero,
             4::smallint, 'NONE'::rounding_mode, p_include_draft
           ) as avg_value
    from level_subjects ls
    join student_level sl on sl.level_id = ls.level_id
  ),
  notees as (
    select * from per_subject where avg_value is not null
  ),
  -- Deux moyennes : les matieres obligatoires seules, et toutes.
  obligatoires as (
    select sum(avg_value * coefficient) / nullif(sum(coefficient), 0) as m
    from notees where is_mandatory
  ),
  toutes as (
    select sum(avg_value * coefficient) / nullif(sum(coefficient), 0) as m
    from notees
  )
  select app.round_score(
           case upper(coalesce(p_optional_mode, 'COUNT'))
             when 'EXCLUDE' then (select m from obligatoires)
             -- greatest ignore les NULL : un eleve qui n'a de notes QUE dans
             -- une matiere facultative garde donc sa moyenne, il ne perd rien.
             when 'BONUS' then greatest((select m from toutes), (select m from obligatoires))
             else (select m from toutes)
           end,
           p_decimals,
           p_rounding
         );
$function$;

create or replace function public.student_period_average(
  p_student uuid,
  p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'::rounding_mode,
  p_include_draft boolean default false,
  p_optional_mode text default 'COUNT'
)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select app.student_period_average(
    p_student, p_period, p_scale_max,
    p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft, p_optional_mode
  );
$function$;

create or replace function app.class_period_ranking(
  p_class uuid,
  p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'::rounding_mode,
  p_include_draft boolean default false,
  p_optional_mode text default 'COUNT'
)
returns table(student_id uuid, general_average numeric, rank_position integer, class_size integer)
language sql
stable
as $function$
  with year_of_period as (
    select ap.academic_year_id from academic_periods ap where ap.id = p_period
  ),
  averages as (
    select se.student_id,
           app.student_period_average(
             se.student_id, p_period, p_scale_max,
             p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft, p_optional_mode
           ) as avg_value
    from student_enrollments se
    join year_of_period y on y.academic_year_id = se.academic_year_id
    where se.class_id = p_class and se.status = 'ENROLLED'
  )
  select a.student_id,
         a.avg_value,
         case
           when a.avg_value is null then null
           else rank() over (order by a.avg_value desc nulls last)::integer
         end,
         -- L'effectif reste celui des eleves INSCRITS : c'est le « / 50 » d'un
         -- bulletin, pas le nombre d'eleves notes.
         (select count(*)::integer from averages)
  from averages a
  order by 3 nulls last;
$function$;

create or replace function public.class_period_ranking(
  p_class uuid,
  p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'::rounding_mode,
  p_include_draft boolean default false,
  p_optional_mode text default 'COUNT'
)
returns table(student_id uuid, general_average numeric, rank_position integer, class_size integer)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select * from app.class_period_ranking(
    p_class, p_period, p_scale_max,
    p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft, p_optional_mode
  );
$function$;

grant execute on function app.student_period_average(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean, text) to authenticated, service_role;
grant execute on function public.student_period_average(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean, text) to anon, authenticated, service_role;
grant execute on function app.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean, text) to authenticated, service_role;
grant execute on function public.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean, text) to anon, authenticated, service_role;
