-- =============================================================================
-- 0067 — Congés propres à chaque ordre, et séances qui suivent
-- =============================================================================
--
-- Les congés du technique et du professionnel ne tombent pas aux mêmes dates que
-- ceux du général (Toussaint à partir du 27 octobre au lieu du 23, congé de
-- février, grandes vacances dès le 16 juillet…). Un congé doit donc pouvoir ne
-- concerner QUE certains ordres, sinon un congé du technique arrêterait aussi
-- les classes de 6e.
--
--   school_calendar_events.tracks   ordres concernés ; NULL = toute l'école
--
-- Et la fabrication des séances datées (0063) en tient compte : une classe suit
-- les périodes ET les congés de SON ordre d'enseignement — celui de son niveau,
-- via son cycle.

alter table school_calendar_events
  add column if not exists tracks education_track[];

alter table school_calendar_events
  drop constraint if exists school_calendar_events_tracks_not_empty;
alter table school_calendar_events
  add constraint school_calendar_events_tracks_not_empty check (tracks is null or cardinality(tracks) >= 1);

comment on column school_calendar_events.tracks is
  'Ordres d''enseignement concernés par le congé. NULL = tous les ordres.';

-- -----------------------------------------------------------------------------
-- Ordre d'enseignement d'un cours : celui de la classe visée (niveau → cycle).
-- Un cours sans classe (rare) est rattaché au général.
-- -----------------------------------------------------------------------------
create or replace function app.session_track(p_session uuid)
returns education_track
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.track
       from schedule_session_targets t
       join classes cl on cl.id = t.class_id
       join levels l on l.id = cl.level_id
       join cycles c on c.id = l.cycle_id
      where t.session_id = p_session and t.class_id is not null
      order by t.id
      limit 1),
    'GENERAL'::education_track);
$$;

revoke all on function app.session_track(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Séances datées : chaque classe suit le calendrier de SON ordre
-- -----------------------------------------------------------------------------
create or replace function app.sync_year_occurrences(p_year uuid, p_from date default null, p_to date default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school      uuid;
  v_tz          text;
  v_start       date;
  v_end         date;
  v_today       date;
  v_from        date;
  v_to          date;
  v_version     uuid;
  v_has_periods boolean;
  v_inserted    integer := 0;
begin
  select y.school_id, coalesce(nullif(s.timezone, ''), 'UTC'), y.starts_on, y.ends_on
    into v_school, v_tz, v_start, v_end
    from academic_years y
    join schools s on s.id = y.school_id
   where y.id = p_year;
  if not found then
    return 0;
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_from  := greatest(v_start, coalesce(p_from, v_start));
  v_to    := least(v_end, coalesce(p_to, v_end));

  select v.id into v_version
    from schedule_versions v
   where v.academic_year_id = p_year and v.status = 'PUBLISHED'
   order by v.published_at desc nulls last
   limit 1;
  v_has_periods := exists (select 1 from academic_periods p where p.academic_year_id = p_year);

  -- 1. Séances à venir d'une version qui n'est plus la version publiée.
  delete from session_occurrences o
   using schedule_sessions ss
   where ss.id = o.schedule_session_id
     and o.academic_year_id = p_year
     and o.occurs_on >= greatest(v_today, v_from) and o.occurs_on <= v_to
     and ss.schedule_version_id is distinct from v_version
     and not exists (select 1 from attendance_registers r where r.session_occurrence_id = o.id);

  if v_version is null then
    return 0;
  end if;

  -- 2. Séances à venir tombées hors des périodes de LEUR ordre.
  with sess as materialized (
    select ss.id, app.session_track(ss.id) as track
      from schedule_sessions ss
     where ss.schedule_version_id = v_version
  )
  delete from session_occurrences o
   using sess s
   where s.id = o.schedule_session_id
     and o.academic_year_id = p_year
     and o.occurs_on >= greatest(v_today, v_from) and o.occurs_on <= v_to
     and (o.status = 'SCHEDULED' or (o.status = 'CANCELLED' and o.cancellation_reason like 'Congé : %'))
     and v_has_periods
     and not exists (
       select 1 from academic_periods p
        where p.academic_year_id = p_year
          and o.occurs_on between p.starts_on and p.ends_on
          and (p.tracks is null or s.track = any(p.tracks))
     )
     and not exists (select 1 from attendance_registers r where r.session_occurrence_id = o.id);

  -- 3. Congés de l'ordre : séance prévue un jour de congé -> annulée (motif = le
  --    congé qui couvre le jour) ; annulée par un congé qui ne la concerne plus
  --    -> rétablie.
  with sess as materialized (
    select ss.id, app.session_track(ss.id) as track
      from schedule_sessions ss
     where ss.schedule_version_id = v_version
  ),
  cover as (
    select o.id,
           (select e.name
              from school_calendar_events e
             where e.academic_year_id = p_year
               and e.blocks_schedule
               and o.occurs_on between e.starts_on and e.ends_on
               and (e.tracks is null or s.track = any(e.tracks))
             order by e.starts_on, e.id
             limit 1) as name
      from session_occurrences o
      join sess s on s.id = o.schedule_session_id
     where o.academic_year_id = p_year
       and o.occurs_on between v_from and v_to
       and (o.status = 'SCHEDULED' or (o.status = 'CANCELLED' and o.cancellation_reason like 'Congé : %'))
       and not exists (select 1 from attendance_registers r where r.session_occurrence_id = o.id)
  )
  update session_occurrences o
     set status = case when c.name is null then 'SCHEDULED'::occurrence_status else 'CANCELLED'::occurrence_status end,
         cancellation_reason = case when c.name is null then null else 'Congé : ' || c.name end,
         updated_at = now()
    from cover c
   where o.id = c.id
     and (o.status is distinct from case when c.name is null then 'SCHEDULED'::occurrence_status else 'CANCELLED'::occurrence_status end
          or o.cancellation_reason is distinct from case when c.name is null then null else 'Congé : ' || c.name end);

  -- 4. Séances manquantes : jours de classe à venir, ordre par ordre.
  with sess as materialized (
    select ss.id, ss.day_of_week, ss.starts_at, ss.ends_at, app.session_track(ss.id) as track
      from schedule_sessions ss
     where ss.schedule_version_id = v_version
  ),
  days as (
    select t.track, d::date as day
      from (select distinct track from sess) t
      cross join generate_series(greatest(v_today, v_from), v_to, interval '1 day') d
     where (not v_has_periods
            or exists (select 1 from academic_periods p
                        where p.academic_year_id = p_year
                          and d::date between p.starts_on and p.ends_on
                          and (p.tracks is null or t.track = any(p.tracks))))
       and not exists (select 1 from school_calendar_events e
                        where e.academic_year_id = p_year and e.blocks_schedule
                          and d::date between e.starts_on and e.ends_on
                          and (e.tracks is null or t.track = any(e.tracks)))
  )
  insert into session_occurrences (school_id, academic_year_id, schedule_session_id, occurs_on, starts_at, ends_at, status)
  select v_school, p_year, s.id, days.day,
         (days.day + s.starts_at) at time zone v_tz,
         (days.day + s.ends_at) at time zone v_tz,
         'SCHEDULED'
    from days
    join sess s on s.track = days.track and s.day_of_week = extract(isodow from days.day)::int
  on conflict (schedule_session_id, occurs_on) do nothing;
  get diagnostics v_inserted = row_count;

  return v_inserted;
end;
$$;

revoke all on function app.sync_year_occurrences(uuid, date, date) from public, anon, authenticated;
