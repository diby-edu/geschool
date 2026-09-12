-- =============================================================================
-- 0036 — Passerelle publique pour les calculs de moyennes (lot 8)
-- =============================================================================
--
-- Meme cause que 0032/0033 : supabase.rpc() ne cherche que dans le schema
-- public. Les fonctions de calcul vivent dans app.* (migration 0022) ; on
-- expose ici de fins wrappers publics.
--
-- SECURITY INVOKER : les fonctions app.* sous-jacentes ne contournent pas la
-- RLS. L'appelant ne voit donc dans le calcul que les notes qu'il a le droit de
-- lire. Les ecrans de moyennes/classement sont pour cette raison reserves a
-- « grades.view_all » (direction), dont la RLS ouvre toutes les notes de
-- l'etablissement — le calcul est alors complet et exact.

create or replace function public.student_subject_average(
  p_student uuid, p_subject uuid, p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'
)
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select app.student_subject_average(
    p_student, p_subject, p_period, p_scale_max,
    p_absent_counts_as_zero, p_decimals, p_rounding
  );
$$;

create or replace function public.student_period_average(
  p_student uuid, p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'
)
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select app.student_period_average(
    p_student, p_period, p_scale_max,
    p_absent_counts_as_zero, p_decimals, p_rounding
  );
$$;

create or replace function public.class_period_ranking(
  p_class uuid, p_period uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'
)
returns table (
  student_id      uuid,
  general_average numeric,
  rank_position   integer,
  class_size      integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select * from app.class_period_ranking(
    p_class, p_period, p_scale_max,
    p_absent_counts_as_zero, p_decimals, p_rounding
  );
$$;

grant execute on function
  public.student_subject_average(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode),
  public.student_period_average(uuid, uuid, numeric, boolean, smallint, rounding_mode),
  public.class_period_ranking(uuid, uuid, numeric, boolean, smallint, rounding_mode)
to authenticated, service_role;
