-- =============================================================================
-- 0115 — Un cours = une heure, partout
-- =============================================================================
--
-- Règle de l'établissement (2026-10-15) : un cours compte pour UNE HEURE, que
-- le créneau dure 50, 55 ou 60 minutes. Seule la grille de l'emploi du temps
-- garde l'horaire réel. Partout ailleurs (programme, affectations, service des
-- enseignants, heures d'absence, heures faites, paie), une séance = 1 h,
-- stockée 60 en base.
--
-- 1. Les volumes déjà enregistrés au rythme du créneau (programme : 6 séances
--    × 55 = 330) passent au rythme de l'heure (6 × 60 = 360). Une valeur déjà
--    multiple de 60 n'est pas touchée (elle est déjà en heures).
-- 2. Les heures d'absence se comptent en créneaux : un cours de 2 créneaux
--    manqué = 2 h (avant : durée arrondie à l'heure).
-- =============================================================================

-- 1. Volumes : séances × durée du créneau -> séances × 60.
with slot as (
  select distinct on (sc.school_id) sc.school_id, sc.default_session_minutes m
  from schedule_configurations sc
  where sc.default_session_minutes is not null and sc.default_session_minutes > 0 and sc.default_session_minutes <> 60
  order by sc.school_id, sc.created_at
)
update level_subjects ls
   set weekly_minutes = (ls.weekly_minutes / slot.m) * 60
  from slot
 where slot.school_id = ls.school_id
   and ls.weekly_minutes > 0
   and ls.weekly_minutes % slot.m = 0
   and ls.weekly_minutes % 60 <> 0;

with slot as (
  select distinct on (sc.school_id) sc.school_id, sc.default_session_minutes m
  from schedule_configurations sc
  where sc.default_session_minutes is not null and sc.default_session_minutes > 0 and sc.default_session_minutes <> 60
  order by sc.school_id, sc.created_at
)
update teaching_assignments ta
   set weekly_minutes = (ta.weekly_minutes / slot.m) * 60
  from slot
 where slot.school_id = ta.school_id
   and ta.weekly_minutes > 0
   and ta.weekly_minutes % slot.m = 0
   and ta.weekly_minutes % 60 <> 0;

with slot as (
  select distinct on (sc.school_id) sc.school_id, sc.default_session_minutes m
  from schedule_configurations sc
  where sc.default_session_minutes is not null and sc.default_session_minutes > 0 and sc.default_session_minutes <> 60
  order by sc.school_id, sc.created_at
)
update teachers t
   set weekly_minutes_min = case when t.weekly_minutes_min % slot.m = 0 and t.weekly_minutes_min % 60 <> 0
                                 then (t.weekly_minutes_min / slot.m) * 60 else t.weekly_minutes_min end,
       weekly_minutes_max = case when t.weekly_minutes_max % slot.m = 0 and t.weekly_minutes_max % 60 <> 0
                                 then (t.weekly_minutes_max / slot.m) * 60 else t.weekly_minutes_max end
  from slot
 where slot.school_id = t.school_id
   and (t.weekly_minutes_min is not null or t.weekly_minutes_max is not null);

comment on column level_subjects.weekly_minutes is
  'Heures de cours par semaine x 60 (1 cours = 1 h, quelle que soit la duree du creneau).';
comment on column teaching_assignments.weekly_minutes is
  'Heures de cours par semaine x 60 (1 cours = 1 h, quelle que soit la duree du creneau).';

-- 2. Combien d'heures de cours vaut une séance : le nombre de créneaux de cours
--    qu'elle occupe (1 au minimum).
create or replace function app.session_course_hours(p_session uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select greatest(1, count(ts.id))::int
  from schedule_sessions ss
  join time_slots st on st.id = ss.start_slot_id
  left join time_slots ts
    on ts.schedule_configuration_id = st.schedule_configuration_id
   and ts.day_of_week = ss.day_of_week
   and ts.kind = 'TEACHING'
   and ts.starts_at >= ss.starts_at
   and ts.ends_at <= ss.ends_at
  where ss.id = p_session
$$;
grant execute on function app.session_course_hours(uuid) to authenticated, service_role;

create or replace function public.attendance_hours(p_school uuid, p_students uuid[], p_from date, p_to date)
returns table (student_id uuid, unjustified_hours numeric, justified_hours numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with missed as (
    select r.student_id,
           r.status,
           o.occurs_on,
           -- 1 cours = 1 heure : un cours de deux créneaux manqué = 2 h.
           app.session_course_hours(o.schedule_session_id)::numeric as hours
    from attendance_records r
    join attendance_registers g on g.id = r.register_id
    join session_occurrences o on o.id = g.session_occurrence_id
    where r.school_id = p_school
      and r.student_id = any(p_students)
      and r.status in ('ABSENT', 'EXCUSED')
      and o.status <> 'CANCELLED'
      and o.occurs_on between p_from and p_to
  ),
  tagged as (
    select m.student_id,
           m.hours,
           (m.status = 'EXCUSED' or exists (
              select 1 from absence_justifications j
              where j.school_id = p_school
                and j.student_id = m.student_id
                and j.status = 'APPROVED'
                and m.occurs_on between j.covers_from and j.covers_to
           )) as justified
    from missed m
  )
  select t.student_id,
         coalesce(sum(t.hours) filter (where not t.justified), 0)::numeric,
         coalesce(sum(t.hours) filter (where t.justified), 0)::numeric
  from tagged t
  group by t.student_id;
$$;
