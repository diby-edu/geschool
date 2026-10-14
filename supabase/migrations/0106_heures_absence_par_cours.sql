-- =============================================================================
-- 0106 — Heures d'absence : un cours manqué compte en HEURES DE COURS
-- =============================================================================
--
-- 0105 additionnait la durée exacte des cours : deux absences à des cours de
-- 55 minutes donnaient 1,83 h. Ce n'est pas ainsi qu'une école compte : un
-- cours de 55 minutes est UNE heure de cours. Deux absences = 2 h.
--
-- Règle : la durée de chaque cours manqué est arrondie à l'heure la plus
-- proche, avec au moins 1 h par cours (55 min -> 1 h ; 1 h 50 -> 2 h).
-- =============================================================================

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
           greatest(1, round(extract(epoch from (coalesce(o.override_ends_at, o.ends_at)
                                               - coalesce(o.override_starts_at, o.starts_at))) / 3600.0)) as hours
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
