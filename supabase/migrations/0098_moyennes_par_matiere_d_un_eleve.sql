-- =============================================================================
-- 0098 — Les moyennes par matiere d'UN eleve, en un seul appel
--
-- L'espace Parent gagne une page « Mes notes » : par matiere, les notes
-- publiees de l'enfant et la moyenne qui en decoule. Le calcul existe deja et
-- ne sera pas refait ailleurs — app.student_subject_average (0038) est la seule
-- definition d'une moyenne de matiere, et le refaire en TypeScript garantirait
-- qu'un jour les deux divergent.
--
-- Mais il fallait l'appeler une fois PAR MATIERE : douze allers-retours pour
-- afficher un bulletin de notes, par enfant. D'ou cette fonction, qui fait la
-- boucle du cote de la base et renvoie tout d'un coup. Elle ne calcule rien
-- de neuf : elle appelle la meme fonction, matiere par matiere.
--
-- SECURITY INVOKER (le defaut), et c'est capital : la liste des matieres se
-- deduit des notes que L'APPELANT a le droit de lire. Un parent n'a aucune
-- permission (0028) ; la RLS de `grades` ne lui ouvre que les evaluations
-- PUBLIEES de ses enfants. Il obtient donc les moyennes de son enfant sur les
-- notes publiees, et rien d'autre — exactement ce que la page lui annonce.
-- =============================================================================

create or replace function app.student_period_subject_averages(
  p_student               uuid,
  p_period                uuid,
  p_scale_max             numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals              smallint default 2,
  p_rounding              rounding_mode default 'HALF_UP',
  p_include_draft         boolean default false
)
returns table (subject_id uuid, average numeric)
language sql
stable
as $$
  select m.subject_id,
         app.student_subject_average(
           p_student, m.subject_id, p_period,
           p_scale_max, p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft
         ) as average
  from (
    select distinct a.subject_id
    from grades g
    join assessments a on a.id = g.assessment_id
    where g.student_id = p_student
      and a.academic_period_id = p_period
  ) m;
$$;

grant execute on function
  app.student_period_subject_averages(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean)
to authenticated, service_role;

-- Passerelle publique : supabase.rpc() ne cherche que dans `public` (cf. 0036).
create or replace function public.student_period_subject_averages(
  p_student uuid, p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP',
  p_include_draft boolean default false
)
returns table (subject_id uuid, average numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select * from app.student_period_subject_averages(
    p_student, p_period, p_scale_max,
    p_absent_counts_as_zero, p_decimals, p_rounding, p_include_draft
  );
$$;

grant execute on function
  public.student_period_subject_averages(uuid, uuid, numeric, boolean, smallint, rounding_mode, boolean)
to authenticated, service_role;
