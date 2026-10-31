-- =============================================================================
-- 0165 — Tableau de bord : la tendance des présences sans détour ; nom du professeur
-- =============================================================================
-- 1. La tendance des 6 semaines passait par app.dashboard_occurrences, qui
--    calcule pour chaque cours sa classe et son professeur (deux sous-requêtes
--    par cours, ~12 000 cours) dont la tendance ne se sert pas. Mesuré en ligne
--    le 2026-10-31 : c'était la lecture la plus longue du tableau de bord
--    (0,4 s), celle que tout le reste attendait. Même calcul, mêmes chiffres :
--    cours tenus (ni annulés ni déplacés), terminés, appel soumis ou validé, et
--    les totaux par appel (0160).
-- 2. Présences du jour (0162) : le professeur s'écrit « KONE Aya », comme
--    partout ailleurs, et non « Kone Aya ».
-- =============================================================================

create or replace function public.dashboard_weekly_attendance(p_school uuid, p_from date, p_to date, p_now timestamptz)
returns table (week_start date, records int, ok int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_read(p_school, 'attendance.view_all') then
    raise exception 'Droit requis : consulter toutes les presences.' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Periode invalide.' using errcode = '22023';
  end if;
  return query
  select date_trunc('week', o.occurs_on)::date,
         sum(n.records)::int,
         sum(n.ok)::int
  from session_occurrences o
  join attendance_registers r
    on r.session_occurrence_id = o.id and r.status in ('SUBMITTED', 'VALIDATED')
  join app.attendance_register_counts n on n.register_id = r.id
  where o.school_id = p_school
    and o.occurs_on between p_from and p_to
    and o.status not in ('CANCELLED', 'MOVED')
    and coalesce(o.override_ends_at, o.ends_at) <= p_now
  group by 1
  order by 1;
end;
$$;

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
           (select nullif(btrim(upper(coalesce(te.last_name, '')) || ' ' || coalesce(te.first_name, '')), '')
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

-- =============================================================================
-- 3. Appels non faits : la base ne rend que les cours SANS appel
-- =============================================================================
-- La page lisait tous les cours de la période (≈ 2 600 sur une semaine, avec
-- leur classe, leur professeur et leur appel), en trois paquets successifs, pour
-- n'en garder que les cours sans appel : 2,5 s mesurées en ligne le 2026-10-31.
-- Mêmes règles que listMissingCalls : cours prévus et terminés, dont l'appel
-- n'est ni soumis ni validé (un appel commencé mais pas fini compte comme
-- manquant). Droits : ceux de la page (appels non faits, ou toutes les présences).
-- =============================================================================

create or replace function public.missing_calls(p_school uuid, p_from date, p_to date, p_now timestamptz)
returns table (
  occurrence_id uuid,
  occurs_on date,
  starts_at timestamptz,
  ends_at timestamptz,
  subject text,
  class_name text,
  teacher_id uuid,
  teacher text,
  reason text,
  note text,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (app.can_read(p_school, 'attendance.missing_calls') or app.can_read(p_school, 'attendance.view_all')) then
    raise exception 'Droit requis : appels non faits.' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'Periode invalide.' using errcode = '22023';
  end if;
  return query
  select o.id, o.occurs_on, o.starts_at, o.ends_at,
         coalesce(sj.name, 'Cours'),
         (select c.name from schedule_session_targets t join classes c on c.id = t.class_id
           where t.session_id = o.schedule_session_id order by t.id limit 1),
         lead.teacher_id,
         (select upper(te.last_name) || ' ' || te.first_name from teachers te where te.id = lead.teacher_id),
         g.reason, g.note, g.reviewed_at
  from session_occurrences o
  left join schedule_sessions ss on ss.id = o.schedule_session_id
  left join subjects sj on sj.id = ss.subject_id
  left join attendance_registers r on r.session_occurrence_id = o.id
  left join attendance_gaps g on g.session_occurrence_id = o.id
  left join lateral (
    select st.teacher_id from schedule_session_teachers st
    where st.session_id = o.schedule_session_id
    order by (st.role = 'LEAD') desc, st.teacher_id
    limit 1
  ) lead on true
  where o.school_id = p_school
    and o.status = 'SCHEDULED'
    and o.occurs_on between p_from and p_to
    and o.ends_at < p_now
    and (r.id is null or r.status not in ('SUBMITTED', 'VALIDATED'))
  order by o.occurs_on desc, o.starts_at desc;
end;
$$;
revoke all on function public.missing_calls(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.missing_calls(uuid, date, date, timestamptz) to authenticated;

-- =============================================================================
-- 4. Générer l'emploi du temps : les cours à placer en une lecture
-- =============================================================================
-- La page lisait les 904 enseignements avec leurs classes, niveaux, groupes et
-- professeurs : la base revérifiait les droits à chaque ligne de chacune de ces
-- tables (2 s mesurées en ligne le 2026-10-31). Ici, le droit de lecture est
-- vérifié une fois (le même que requirements_select : voir l'emploi du temps)
-- et la réponse a exactement la forme de l'ancienne lecture.
-- =============================================================================

create or replace function public.requirements_overview(p_school uuid, p_year uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not app.can_read(p_school, 'schedule.view') then
    raise exception 'Droit requis : consulter l''emploi du temps.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', tr.id,
           'created_at', tr.created_at,
           'weekly_minutes', tr.weekly_minutes,
           'sessions_count', tr.sessions_count,
           'session_duration_minutes', tr.session_duration_minutes,
           'block_hours', tr.block_hours,
           'room_requirement_mode', tr.room_requirement_mode,
           'status', tr.status,
           'required_room_id', tr.required_room_id,
           'required_room_type_id', tr.required_room_type_id,
           'preferred_room_id', tr.preferred_room_id,
           'preferred_room_type_id', tr.preferred_room_type_id,
           'min_capacity', tr.min_capacity,
           'required_features', tr.required_features,
           'subject_id', tr.subject_id,
           'teaching_assignment_id', tr.teaching_assignment_id,
           'subjects', (select jsonb_build_object('name', sj.name) from subjects sj where sj.id = tr.subject_id),
           'teaching_requirement_targets', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'target_type', t.target_type,
                      'class_id', t.class_id,
                      'classes', case when c.id is null then null else jsonb_build_object(
                        'name', c.name, 'level_id', c.level_id, 'main_room_id', c.main_room_id,
                        'levels', case when l.id is null then null else jsonb_build_object('name', l.name, 'sequence', l.sequence) end) end,
                      'groups', case when g.id is null then null else jsonb_build_object('name', g.name) end))
             from teaching_requirement_targets t
             left join classes c on c.id = t.class_id
             left join levels l on l.id = c.level_id
             left join groups g on g.id = t.group_id
             where t.requirement_id = tr.id), '[]'::jsonb),
           'teaching_requirement_teachers', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'teacher_id', rt.teacher_id,
                      'teachers', case when te.id is null then null else jsonb_build_object(
                        'first_name', te.first_name, 'last_name', te.last_name, 'staff_number', te.staff_number) end))
             from teaching_requirement_teachers rt
             left join teachers te on te.id = rt.teacher_id
             where rt.requirement_id = tr.id), '[]'::jsonb)
         )), '[]'::jsonb)
  into v
  from teaching_requirements tr
  where tr.school_id = p_school and tr.academic_year_id = p_year;
  return v;
end;
$$;
revoke all on function public.requirements_overview(uuid, uuid) from public, anon;
grant execute on function public.requirements_overview(uuid, uuid) to authenticated;
