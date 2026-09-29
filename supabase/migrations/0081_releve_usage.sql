-- =============================================================================
-- 0081 — Relevé d'usage des établissements
-- =============================================================================
--
-- `usage_records` existait depuis l'origine — cinq metriques, des policies
-- correctes — et n'a jamais recu une seule ligne : rien ne les relevait, et
-- aucun ecran ne les montrait. Le Super Admin facture des abonnements sans
-- savoir ce que chaque ecole consomme.
--
-- Cette fonction prend un instantane, ecole par ecole, pour une date donnee.
-- Elle est REJOUABLE : relever deux fois le meme jour remplace la valeur au
-- lieu d'en empiler une seconde.
--
-- Trois metriques seulement, celles que la base connait vraiment :
--   STUDENTS              — eleves inscrits, annee courante ;
--   USERS                 — comptes actifs de l'ecole ;
--   SCHEDULE_GENERATIONS  — generations d'emploi du temps reussies, cumul.
-- STORAGE_MB et SMS_SENT dependent de sources externes (stockage, operateur) :
-- on ne les invente pas.

create unique index if not exists usage_records_unique_idx
  on public.usage_records (school_id, metric, recorded_for);

create or replace function public.snapshot_usage(p_for date default current_date)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_count integer := 0;
begin
  if not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme.' using errcode = '42501';
  end if;

  with courante as (
    select y.school_id, y.id as year_id
    from public.academic_years y
    where y.is_current
  ),
  mesures as (
    select s.id as school_id,
           'STUDENTS'::usage_metric as metric,
           (
             select count(*)
             from public.student_enrollments e
             join courante c on c.school_id = s.id and c.year_id = e.academic_year_id
             where e.school_id = s.id and e.status = 'ENROLLED'
           )::numeric as value
    from public.schools s
    union all
    select s.id,
           'USERS'::usage_metric,
           (
             select count(*)
             from public.school_memberships m
             where m.school_id = s.id and m.status = 'ACTIVE'
           )::numeric
    from public.schools s
    union all
    select s.id,
           'SCHEDULE_GENERATIONS'::usage_metric,
           (
             select count(*)
             from public.schedule_generation_jobs j
             where j.school_id = s.id and j.status = 'SUCCEEDED'
           )::numeric
    from public.schools s
  )
  insert into public.usage_records (school_id, metric, value, recorded_for, source)
  select school_id, metric, value, p_for, 'snapshot'
  from mesures
  on conflict (school_id, metric, recorded_for)
  do update set value = excluded.value, source = excluded.source;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

grant execute on function public.snapshot_usage(date) to authenticated, service_role;
