-- =============================================================================
-- 0037 — Moyennes d'une classe par matière (lot 10, bulletins)
-- =============================================================================
--
-- La génération d'un bulletin a besoin, par matière, de la moyenne de CHAQUE
-- élève de la classe (pour en déduire moyenne de classe, min, max, rang). Cette
-- fonction les rend en une seule requête, évitant un aller-retour par cellule.
-- S'appuie sur app.student_subject_average (0022).

create or replace function app.class_subject_averages(
  p_class   uuid,
  p_period  uuid,
  p_subject uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'
)
returns table (student_id uuid, average numeric)
language sql
stable
as $$
  select se.student_id,
         app.student_subject_average(
           se.student_id, p_subject, p_period,
           p_scale_max, p_absent_counts_as_zero, p_decimals, p_rounding
         ) as average
  from student_enrollments se
  join academic_periods ap on ap.id = p_period
  where se.class_id = p_class
    and se.academic_year_id = ap.academic_year_id
    and se.status = 'ENROLLED';
$$;

-- Passerelle publique (supabase.rpc ne voit que public). SECURITY INVOKER : la
-- RLS s'applique — écran réservé à reports.generate / grades.view_all.
create or replace function public.class_subject_averages(
  p_class uuid, p_period uuid, p_subject uuid,
  p_scale_max numeric default 20,
  p_absent_counts_as_zero boolean default false,
  p_decimals smallint default 2,
  p_rounding rounding_mode default 'HALF_UP'
)
returns table (student_id uuid, average numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select * from app.class_subject_averages(
    p_class, p_period, p_subject, p_scale_max, p_absent_counts_as_zero, p_decimals, p_rounding
  );
$$;

grant execute on function
  app.class_subject_averages(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode),
  public.class_subject_averages(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode)
to authenticated, service_role;
