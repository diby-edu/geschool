-- =============================================================================
-- 0074 — « Non classé » n'est pas un rang, et la moyenne générale suit la saisie
-- =============================================================================
--
-- DEUX corrections sur le meme chemin de calcul.
--
-- 1. LE RANG. app.class_period_ranking classait avec « rank() over (order by
--    avg desc nulls last) ». Un eleve sans aucune note recevait donc un rang
--    comme les autres : le dernier. Et quand PERSONNE n'a de moyenne — cas
--    reel : le programme du niveau (level_subjects) n'est pas saisi, donc
--    aucune moyenne generale n'est calculable — tous les eleves sont a egalite
--    et recoivent le rang 1. Constate sur 6eme 1 de l'ecole de demonstration :
--    50 eleves, 50 fois « 1er/50 ». Le bulletin l'aurait imprime tel quel.
--    Un eleve sans moyenne n'est ni premier ni dernier : il n'est pas classe.
--    Le rang vaut alors NULL, et l'application affiche « — ». Les rangs des
--    autres ne changent pas : ils etaient deja calcules avant les NULL.
--
-- 2. CE QUI COMPTE. app.student_subject_average sait, depuis l'origine, inclure
--    ou non les evaluations encore en brouillon (p_include_draft). L'ecran de
--    l'enseignant le demandait ; la moyenne GENERALE et le rang, non — ils ne
--    voyaient que les evaluations cloturees ou publiees. Un meme eleve pouvait
--    donc lire 14,44 en anglais sur l'ecran de son professeur, pendant que sa
--    moyenne generale ignorait completement l'anglais. Mesure sur 6eme 1 :
--    moyenne 12,82 et rang 13 avec les devoirs d'anglais clotures ; 12,28 et
--    rang 26 des qu'ils repassent en brouillon, alors qu'aucune note n'a bouge.
--    Le parametre est donc ajoute ici aussi, et l'application le renseigne
--    depuis un reglage d'etablissement (par defaut : tout ce qui est saisi
--    compte, la moyenne suit la saisie). La cloture d'une evaluation redevient
--    ce qu'elle doit etre : un verrou sur la SAISIE, pas une condition du
--    calcul.
--
-- Les signatures changent : on remplace, on ne surcharge pas — deux versions
-- coexistantes rendraient tout appel a deux arguments ambigu.

drop function if exists public.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode);
drop function if exists app.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode);
drop function if exists public.student_period_average(uuid, uuid, numeric, boolean, smallint, rounding_mode);
drop function if exists app.student_period_average(uuid, uuid, numeric, boolean, smallint, rounding_mode);

create or replace function app.student_period_average(
  p_student uuid,
  p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'::rounding_mode,
  p_include_draft boolean default false
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
    select ls.subject_id,
           ls.coefficient,
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
  )
  select app.round_score(
           sum(avg_value * coefficient) / nullif(sum(coefficient), 0),
           p_decimals,
           p_rounding
         )
  from per_subject
  where avg_value is not null;
$function$;

create or replace function public.student_period_average(
  p_student uuid,
  p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'::rounding_mode,
  p_include_draft boolean default false
)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select app.student_period_average(
    p_student, p_period, p_scale_max,
    p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft
  );
$function$;

create or replace function app.class_period_ranking(
  p_class uuid,
  p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'::rounding_mode,
  p_include_draft boolean default false
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
             p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft
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
  p_include_draft boolean default false
)
returns table(student_id uuid, general_average numeric, rank_position integer, class_size integer)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select * from app.class_period_ranking(
    p_class, p_period, p_scale_max,
    p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft
  );
$function$;

grant execute on function app.student_period_average(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean) to authenticated, service_role;
grant execute on function public.student_period_average(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean) to anon, authenticated, service_role;
grant execute on function app.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean) to authenticated, service_role;
grant execute on function public.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean) to anon, authenticated, service_role;
