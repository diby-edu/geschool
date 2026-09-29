-- =============================================================================
-- 0063 — Séances datées sur toute l'année, selon les trimestres et les congés
-- =============================================================================
--
-- PROBLEME  À la publication, l'emploi du temps ne produisait ses séances datées
--           (celles de l'appel) que sur les 12 premières semaines depuis le début
--           de l'année (fenêtre provisoire, features/schedule/occurrences.ts) :
--           plus aucun appel possible à partir de fin novembre. Il les produisait
--           aussi AVANT la rentrée (l'année commence avant le 1er trimestre), et
--           dans le passé quand on publiait en cours d'année (appels « non faits »
--           comptés pour des jours où l'emploi du temps n'existait pas encore).
--           Enfin, republier une nouvelle version laissait les séances à venir de
--           l'ancienne : cours comptés en double.
--
-- REGLE     Une séance datée existe pour chaque cours de la version PUBLIÉE, chaque
--           JOUR DE CLASSE de l'année :
--             * dans un trimestre (ou dans l'année, s'il n'y a pas de trimestre) ;
--             * hors congés et jours fériés qui bloquent l'emploi du temps
--               (ces jours-là, une séance déjà créée est « annulée », motif
--               « Congé : <nom> », comme en 0062) ;
--             * le jour de la semaine du cours.
--           On ne crée jamais de séance dans le passé, et on ne touche jamais à une
--           séance dont l'appel est fait, ni à une séance modifiée à la main.
--
-- QUAND     La base resynchronise d'elle-même, quel que soit l'écran :
--             * publication d'un emploi du temps (public.sync_schedule_occurrences,
--               appelée par l'application après la publication) ;
--             * trimestre ajouté, modifié ou supprimé (déclencheurs) ;
--             * congé ajouté, modifié ou supprimé (déclencheur 0062, désormais
--               appuyé sur la même fonction, limitée aux dates concernées).
--           Les années qui ont déjà un emploi du temps publié sont resynchronisées
--           à la fin de cette migration.

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

  -- 2. Séances à venir tombées hors des trimestres (dates de trimestre changées).
  delete from session_occurrences o
   where o.academic_year_id = p_year
     and o.occurs_on >= greatest(v_today, v_from) and o.occurs_on <= v_to
     and (o.status = 'SCHEDULED' or (o.status = 'CANCELLED' and o.cancellation_reason like 'Congé : %'))
     and v_has_periods
     and not exists (
       select 1 from academic_periods p
        where p.academic_year_id = p_year and o.occurs_on between p.starts_on and p.ends_on
     )
     and not exists (select 1 from attendance_registers r where r.session_occurrence_id = o.id);

  -- 3. Congés : séance prévue un jour de congé -> annulée (motif = le congé qui
  --    couvre le jour) ; annulée par un congé qui ne couvre plus le jour -> rétablie.
  --    Passé compris : un jour de congé n'a jamais été un jour de classe.
  with cover as (
    select o.id,
           (select e.name
              from school_calendar_events e
             where e.academic_year_id = p_year
               and e.blocks_schedule
               and o.occurs_on between e.starts_on and e.ends_on
             order by e.starts_on, e.id
             limit 1) as name
      from session_occurrences o
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

  -- 4. Séances manquantes des jours de classe à venir.
  with days as (
    select d::date as day
      from generate_series(greatest(v_today, v_from), v_to, interval '1 day') d
     where (not v_has_periods
            or exists (select 1 from academic_periods p
                        where p.academic_year_id = p_year and d::date between p.starts_on and p.ends_on))
       and not exists (select 1 from school_calendar_events e
                        where e.academic_year_id = p_year and e.blocks_schedule
                          and d::date between e.starts_on and e.ends_on)
  )
  insert into session_occurrences (school_id, academic_year_id, schedule_session_id, occurs_on, starts_at, ends_at, status)
  select v_school, p_year, ss.id, days.day,
         (days.day + ss.starts_at) at time zone v_tz,
         (days.day + ss.ends_at) at time zone v_tz,
         'SCHEDULED'
    from days
    join schedule_sessions ss
      on ss.schedule_version_id = v_version
     and ss.day_of_week = extract(isodow from days.day)::int
  on conflict (schedule_session_id, occurs_on) do nothing;
  get diagnostics v_inserted = row_count;

  return v_inserted;
end;
$$;

revoke all on function app.sync_year_occurrences(uuid, date, date) from public, anon, authenticated;

-- Appelée par l'application après la publication d'un emploi du temps.
create or replace function public.sync_schedule_occurrences(p_year uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school uuid;
begin
  select y.school_id into v_school from academic_years y where y.id = p_year;
  if v_school is null or not (app.can_write(v_school, 'schedule.publish') or app.can_write(v_school, 'academic_years.manage')) then
    raise exception 'Droit requis : publier l''emploi du temps.' using errcode = '42501';
  end if;
  return app.sync_year_occurrences(p_year);
end;
$$;

revoke all on function public.sync_schedule_occurrences(uuid) from public, anon;
grant execute on function public.sync_schedule_occurrences(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Congés (remplace le corps de 0062) : resynchronisation limitée aux dates touchées
-- -----------------------------------------------------------------------------
create or replace function app.sync_occurrences_with_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform app.sync_year_occurrences(old.academic_year_id, old.starts_on, old.ends_on);
  elsif tg_op = 'INSERT' then
    perform app.sync_year_occurrences(new.academic_year_id, new.starts_on, new.ends_on);
  else
    perform app.sync_year_occurrences(new.academic_year_id, least(old.starts_on, new.starts_on), greatest(old.ends_on, new.ends_on));
    if old.academic_year_id is distinct from new.academic_year_id then
      perform app.sync_year_occurrences(old.academic_year_id, old.starts_on, old.ends_on);
    end if;
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trimestres : un par instruction (le calendrier officiel insère ses trimestres
-- d'un coup), toute l'année (le premier trimestre créé change la définition même
-- d'un jour de classe : « dans un trimestre » au lieu de « dans l'année »).
-- -----------------------------------------------------------------------------
create or replace function app.sync_occurrences_after_periods()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year uuid;
begin
  -- Seules les dates comptent : ouvrir ou fermer le calcul des moyennes, renommer
  -- un trimestre… ne relance rien.
  for v_year in
    select n.academic_year_id
      from new_rows n join old_rows o on o.id = n.id
     where (o.starts_on, o.ends_on, o.academic_year_id) is distinct from (n.starts_on, n.ends_on, n.academic_year_id)
    union
    select o.academic_year_id
      from new_rows n join old_rows o on o.id = n.id
     where o.academic_year_id is distinct from n.academic_year_id
  loop
    perform app.sync_year_occurrences(v_year);
  end loop;
  return null;
end;
$$;

create or replace function app.sync_occurrences_after_periods_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year uuid;
begin
  for v_year in select distinct academic_year_id from new_rows loop
    perform app.sync_year_occurrences(v_year);
  end loop;
  return null;
end;
$$;

create or replace function app.sync_occurrences_after_periods_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year uuid;
begin
  for v_year in select distinct academic_year_id from old_rows loop
    perform app.sync_year_occurrences(v_year);
  end loop;
  return null;
end;
$$;

revoke all on function app.sync_occurrences_after_periods() from public, anon, authenticated;
revoke all on function app.sync_occurrences_after_periods_insert() from public, anon, authenticated;
revoke all on function app.sync_occurrences_after_periods_delete() from public, anon, authenticated;

drop trigger if exists academic_periods_sync_ins on academic_periods;
create trigger academic_periods_sync_ins
  after insert on academic_periods
  referencing new table as new_rows
  for each statement execute function app.sync_occurrences_after_periods_insert();

drop trigger if exists academic_periods_sync_upd on academic_periods;
create trigger academic_periods_sync_upd
  after update on academic_periods
  referencing old table as old_rows new table as new_rows
  for each statement execute function app.sync_occurrences_after_periods();

drop trigger if exists academic_periods_sync_del on academic_periods;
create trigger academic_periods_sync_del
  after delete on academic_periods
  referencing old table as old_rows
  for each statement execute function app.sync_occurrences_after_periods_delete();

-- -----------------------------------------------------------------------------
-- Années qui ont déjà un emploi du temps publié : resynchronisées maintenant.
-- -----------------------------------------------------------------------------
select app.sync_year_occurrences(v.academic_year_id)
  from schedule_versions v
 where v.status = 'PUBLISHED';
