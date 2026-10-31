-- =============================================================================
-- 0162 — Présences du jour : un résumé par classe, en une lecture
-- =============================================================================
-- Maquette « listes et présences », validée le 2026-10-30. La page listait les
-- 480 cours du jour un par un. Ici, une ligne par classe : ses cours de la
-- journée dans l'ordre (horaire, matière, professeur, durée en créneaux, état
-- de l'appel), et ses élèves absents, excusés et en retard.
--
-- Un cours compte dans CHACUNE de ses classes : un cours commun (EPS 6e A +
-- 6e B) dans les deux, un cours de groupe (Espagnol 4e) dans les classes du
-- groupe. Un cours de plusieurs créneaux (bloc de 2 h) reste UN cours, avec UN
-- appel ; « hours » dit combien de créneaux il occupe.
--
-- États : done (appel fait), missed (terminé sans appel), now (en cours, pas
-- encore d'appel), later (plus tard). Les élèves sont comptés dans la classe où
-- ils sont inscrits.
-- =============================================================================

create or replace function public.attendance_day_by_class(p_school uuid, p_day date, p_now timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not (app.can_read(p_school, 'attendance.view_all') or app.can_read(p_school, 'schedule.view_all')) then
    raise exception 'Droit requis : consulter toutes les présences.' using errcode = '42501';
  end if;

  with occ as materialized (
    select o.id, o.schedule_session_id as sess_id,
           coalesce(o.override_starts_at, o.starts_at) as s_at,
           coalesce(o.override_ends_at, o.ends_at) as e_at,
           o.override_teacher_id,
           r.id as register_id
    from session_occurrences o
    left join attendance_registers r
      on r.session_occurrence_id = o.id and r.status in ('SUBMITTED', 'VALIDATED')
    where o.school_id = p_school
      and o.occurs_on = p_day
      and o.status not in ('CANCELLED', 'MOVED')
  ),
  sess as materialized (
    select ss.id, ss.subject_id, app.session_course_hours(ss.id) as hours
    from schedule_sessions ss
    where ss.id in (select distinct sess_id from occ)
  ),
  -- Les classes de chaque cours : ses classes cibles, et les classes de ses groupes.
  occ_class as (
    select distinct oc.id as occ_id, x.class_id
    from occ oc
    join lateral (
      select t.class_id from schedule_session_targets t where t.session_id = oc.sess_id and t.class_id is not null
      union
      select gc.class_id from schedule_session_targets t join group_classes gc on gc.group_id = t.group_id
      where t.session_id = oc.sess_id and t.group_id is not null
    ) x on true
  ),
  course as (
    select oc.id, oc.s_at, oc.e_at, s.hours,
           sj.name as subject,
           (select nullif(btrim(coalesce(te.last_name, '') || ' ' || coalesce(te.first_name, '')), '')
              from teachers te
             where te.id = coalesce(
                     oc.override_teacher_id,
                     (select st.teacher_id from schedule_session_teachers st
                       where st.session_id = oc.sess_id order by (st.role = 'LEAD') desc, st.teacher_id limit 1))) as teacher,
           case
             when oc.register_id is not null then 'done'
             when oc.e_at <= p_now then 'missed'
             when oc.s_at <= p_now then 'now'
             else 'later'
           end as state
    from occ oc
    join sess s on s.id = oc.sess_id
    left join subjects sj on sj.id = s.subject_id
  ),
  -- Élèves de la journée : absent (au moins une absence), excusé, en retard.
  per_student as (
    select ar.student_id,
           bool_or(ar.status = 'ABSENT') as plain_abs,
           bool_or(ar.status = 'EXCUSED') as exc,
           bool_or(ar.status = 'LATE') as late
    from occ oc
    join attendance_records ar on ar.register_id = oc.register_id
    group by ar.student_id
  ),
  per_class as (
    select e.class_id,
           count(*) filter (where p.plain_abs or p.exc)::int as absent,
           count(*) filter (where p.exc and not p.plain_abs)::int as excused,
           count(*) filter (where not (p.plain_abs or p.exc) and p.late)::int as late
    from per_student p
    join student_enrollments e
      on e.student_id = p.student_id and e.school_id = p_school and e.status = 'ENROLLED'
    join academic_years y on y.id = e.academic_year_id and p_day between y.starts_on and y.ends_on
    group by e.class_id
  )
  select jsonb_build_object(
    'classes', coalesce(jsonb_agg(
      jsonb_build_object(
        'class_id', c.id,
        'name', c.name,
        'level_id', c.level_id,
        'level_name', l.name,
        'level_seq', coalesce(l.sequence, 999),
        'absent', coalesce(pc.absent, 0),
        'excused', coalesce(pc.excused, 0),
        'late', coalesce(pc.late, 0),
        'courses', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'id', co.id, 'starts_at', co.s_at, 'ends_at', co.e_at, 'hours', co.hours,
                   'subject', coalesce(co.subject, 'Cours'), 'teacher', co.teacher, 'state', co.state)
                 order by co.s_at), '[]'::jsonb)
          from occ_class x join course co on co.id = x.occ_id
          where x.class_id = c.id)
      ) order by coalesce(l.sequence, 999), c.name), '[]'::jsonb)
  )
  into v
  from classes c
  left join levels l on l.id = c.level_id
  left join per_class pc on pc.class_id = c.id
  where c.school_id = p_school
    and c.status = 'ACTIVE'
    and exists (select 1 from occ_class x where x.class_id = c.id);
  return v;
end;
$$;
revoke all on function public.attendance_day_by_class(uuid, date, timestamptz) from public, anon;
grant execute on function public.attendance_day_by_class(uuid, date, timestamptz) to authenticated;
