-- =============================================================================
-- 0083 — Le classement d'une classe en une seule requete
--
-- MESURE AVANT : 5,5 a 5,7 s pour une classe de 50 eleves, pour un delai de
-- coupure a 8 s. Le 1er trimestre passait, le 3e echouait — et l'echec etait
-- avale par l'application, qui imprimait alors 50 bulletins sans une moyenne.
--
-- POURQUOI c'etait lent : app.class_period_ranking appelait
-- app.student_period_average une fois PAR ELEVE (50), qui appelait a son tour
-- app.student_subject_average une fois PAR MATIERE (12). Soit 600 requetes sur
-- grades + assessments, chacune traversant les regles d'acces ligne a ligne.
--
-- CE QU'ON CHANGE : une seule lecture des notes de la classe, agregee par
-- matiere puis ponderee par le programme du niveau. Le CALCUL est le meme,
-- etage par etage :
--   * pas d'arrondi a l'etage « matiere » (4 decimales, mode NONE), un seul
--     arrondi au resultat final — sinon l'erreur se propage ;
--   * memes filtres d'eligibilite (brouillons, type comptant dans la moyenne,
--     note exclue, absence justifiee ou non) ;
--   * memes trois traitements de la matiere facultative (COUNT / BONUS /
--     EXCLUDE) ;
--   * rang NULL quand il n'y a pas de moyenne, effectif = eleves INSCRITS.
--
-- SECURITY DEFINER, comme app.class_subject_averages l'est deja : le controle
-- d'acces se fait UNE fois, en tete, au lieu d'etre reevalue sur chaque note.
-- Il est plus strict qu'avant, et c'est voulu : un enseignant qui ne voit que
-- ses propres notes recevait jusqu'ici une moyenne « generale » calculee sur
-- sa seule matiere — un chiffre faux, presente comme une moyenne generale.
-- Desormais il ne recoit rien, ce qui est la reponse honnete.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Qui peut voir le classement general d'une classe
--
-- Pas « qui voit des notes » : voir le classement, c'est voir la moyenne
-- generale de chaque eleve. Cela suppose de voir TOUTES les matieres.
-- -----------------------------------------------------------------------------
create or replace function app.can_view_class_grades(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select app.is_platform_admin()
    or exists (
      select 1 from public.classes c
      where c.id = p_class
        and app.can_read(c.school_id, 'grades.view_all')
    )
    or app.is_head_teacher_of(p_class);
$$;

comment on function app.can_view_class_grades(uuid) is
  'Voir la moyenne generale et le rang de toute une classe : administration, ou professeur principal de cette classe.';

-- -----------------------------------------------------------------------------
-- Le classement, en une passe
-- -----------------------------------------------------------------------------
create or replace function app.class_period_ranking(
  p_class uuid,
  p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP',
  p_include_draft boolean default false,
  p_optional_mode text default 'COUNT'
)
returns table(student_id uuid, general_average numeric, rank_position integer, class_size integer)
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  with autorise as (
    select app.can_view_class_grades(p_class) as ok
  ),
  annee as (
    select ap.academic_year_id from public.academic_periods ap where ap.id = p_period
  ),
  -- Les eleves de la classe, et le programme qu'ils suivent.
  eleves as (
    select se.student_id, c.level_id
    from public.student_enrollments se
    join public.classes c on c.id = se.class_id
    join annee y on y.academic_year_id = se.academic_year_id
    cross join autorise a
    where se.class_id = p_class
      and se.status = 'ENROLLED'
      and a.ok
  ),
  -- Toutes les notes utiles, en UNE lecture. Le filtre porte sur l'ELEVE et non
  -- sur la classe de l'evaluation : un eleve note dans un groupe de LV2 rattache
  -- a une autre classe garde ses notes, exactement comme avant.
  notes as (
    select g.student_id,
           a.subject_id,
           coalesce(case when g.is_absent then 0 else g.score end, 0) / a.max_score * a.coefficient as points,
           a.coefficient as coef
    from public.grades g
    join public.assessments a on a.id = g.assessment_id
    join public.assessment_types at2 on at2.id = a.assessment_type_id
    where g.student_id in (select e.student_id from eleves e)
      and a.academic_period_id = p_period
      and (p_include_draft or a.status in ('CLOSED', 'PUBLISHED'))
      and at2.counts_in_average
      and not g.is_excluded_from_average
      and (
        (not g.is_absent and g.score is not null)
        or (g.is_absent and not g.is_excused and p_absent_counts_as_zero)
      )
  ),
  -- La moyenne de chaque matiere, SANS arrondi : arrondir ici propagerait
  -- l'erreur dans la moyenne generale.
  par_matiere as (
    select n.student_id,
           n.subject_id,
           app.round_score(
             sum(n.points) / nullif(sum(n.coef), 0) * p_scale_max,
             4::smallint,
             'NONE'::rounding_mode
           ) as avg_value
    from notes n
    group by n.student_id, n.subject_id
  ),
  -- Ponderation par le programme du niveau. Une matiere sans note ne compte pas.
  notees as (
    select e.student_id, ls.coefficient, ls.is_mandatory, pm.avg_value
    from eleves e
    join public.level_subjects ls on ls.level_id = e.level_id
    join par_matiere pm on pm.student_id = e.student_id and pm.subject_id = ls.subject_id
    where pm.avg_value is not null
  ),
  obligatoires as (
    select n.student_id, sum(n.avg_value * n.coefficient) / nullif(sum(n.coefficient), 0) as m
    from notees n where n.is_mandatory group by n.student_id
  ),
  toutes as (
    select n.student_id, sum(n.avg_value * n.coefficient) / nullif(sum(n.coefficient), 0) as m
    from notees n group by n.student_id
  ),
  moyennes as (
    select e.student_id,
           app.round_score(
             case upper(coalesce(p_optional_mode, 'COUNT'))
               when 'EXCLUDE' then o.m
               -- greatest ignore les NULL : un eleve note dans la seule matiere
               -- facultative garde sa moyenne, il ne perd rien.
               when 'BONUS' then greatest(t.m, o.m)
               else t.m
             end,
             p_decimals,
             p_rounding
           ) as avg_value
    from eleves e
    left join obligatoires o on o.student_id = e.student_id
    left join toutes t on t.student_id = e.student_id
  )
  select m.student_id,
         m.avg_value,
         case
           when m.avg_value is null then null
           else rank() over (order by m.avg_value desc nulls last)::integer
         end,
         -- L'effectif reste celui des eleves INSCRITS : c'est le « / 50 » d'un
         -- bulletin, pas le nombre d'eleves notes.
         (select count(*)::integer from eleves)
  from moyennes m
  order by 3 nulls last;
$$;

comment on function app.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean, text) is
  'Moyenne generale et rang de toute une classe, en une passe. Controle d''acces en tete (SECURITY DEFINER).';
