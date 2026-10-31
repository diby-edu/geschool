-- =============================================================================
-- 0159 — Heures faites et paie, Gestion des accès : une lecture compacte
-- =============================================================================
-- Mesuré le 2026-10-28 (Cocotiers, 170 enseignants, un mois) : la page mettait
-- 2 à 3 s. teacher_course_hours_by_teacher renvoyait 1,3 Mo — tous les cours du
-- mois de chaque enseignant AVEC la classe et la matière, alors que la page ne
-- montre ce détail que pour l'enseignant ouvert — et le droit « paie » était
-- revérifié à chacune des ~10 000 lignes.
--
-- Ici : le droit est vérifié UNE fois, et chaque enseignant reçoit un total PAR
-- JOUR [jour, heures faites, heures sans appel]. Cela suffit au calcul : les
-- heures supplémentaires se comptent semaine par semaine et sont datées du jour
-- du cours qui dépasse le quota ; l'ordre des cours dans une même journée n'y
-- change rien. Le détail cours par cours (classe, matière) n'est rendu que pour
-- p_detail, l'enseignant ouvert sur la page.
-- Mêmes règles que teacher_course_hours (0116), qui reste en place.
-- =============================================================================

create or replace function public.teacher_payroll_courses(
  p_school uuid,
  p_from date,
  p_to date,
  p_detail uuid default null
)
returns table (teacher_id uuid, days jsonb, courses jsonb)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (app.is_platform_admin() or app.can_read(p_school, 'teachers.payroll')) then
    raise exception 'Droit requis : paie des enseignants.' using errcode = '42501';
  end if;

  return query
  with occ as (
    select o.id, o.occurs_on, o.schedule_session_id, o.override_teacher_id,
           coalesce(o.override_starts_at, o.starts_at) as s_at
    from session_occurrences o
    where o.school_id = p_school
      and o.occurs_on between p_from and p_to
      and o.status <> 'CANCELLED'
      and coalesce(o.override_starts_at, o.starts_at) < now()
  ),
  -- « materialized » : sans lui, le nombre d'heures d'une séance était recalculé
  -- pour chacun de ses cours datés (10 000 fois au lieu de 2 000) : 0,7 s → 0,2 s.
  sess as materialized (
    select ss.id, app.session_course_hours(ss.id) as hours, ss.subject_id
    from schedule_sessions ss
    where ss.school_id = p_school
      and ss.id in (select distinct occ.schedule_session_id from occ)
  ),
  lines as materialized (
    select who.teacher_id as tid, o.occurs_on, o.s_at, s.hours, s.id as session_id, s.subject_id,
           exists (select 1 from attendance_registers r where r.session_occurrence_id = o.id) as done
    from occ o
    join sess s on s.id = o.schedule_session_id
    cross join lateral (
      select o.override_teacher_id as teacher_id where o.override_teacher_id is not null
      union all
      select st.teacher_id from schedule_session_teachers st
      where st.session_id = o.schedule_session_id and o.override_teacher_id is null
    ) who
  ),
  per_day as (
    select l.tid, l.occurs_on,
           sum(l.hours) filter (where l.done)::int as done_h,
           sum(l.hours) filter (where not l.done)::int as undone_h
    from lines l
    group by l.tid, l.occurs_on
  ),
  day_totals as (
    select d.tid, jsonb_agg(jsonb_build_array(d.occurs_on, coalesce(d.done_h, 0), coalesce(d.undone_h, 0)) order by d.occurs_on) as totals
    from per_day d
    group by d.tid
  ),
  detail as (
    select l.tid,
           jsonb_agg(
             jsonb_build_array(
               l.occurs_on, l.s_at, l.hours, l.done,
               (select string_agg(c.name, ' + ' order by c.name)
                  from schedule_session_targets t join classes c on c.id = t.class_id
                 where t.session_id = l.session_id),
               (select sj.name from subjects sj where sj.id = l.subject_id)
             )
             order by l.s_at
           ) as lessons
    from lines l
    where l.tid = p_detail
    group by l.tid
  )
  select d.tid, d.totals, x.lessons
  from day_totals d
  left join detail x on x.tid = d.tid;
end;
$$;
revoke all on function public.teacher_payroll_courses(uuid, date, date, uuid) from public, anon;
grant execute on function public.teacher_payroll_courses(uuid, date, date, uuid) to authenticated, service_role;

-- =============================================================================
-- Gestion des accès : les compteurs des tuiles en une lecture
-- =============================================================================
-- La page lançait 11 comptages séparés (par statut, par type, SMS), chacun
-- revérifiant le droit sur chaque ligne. Ici : droit vérifié une fois, un seul
-- passage sur les accès et un sur les envois. Mêmes règles que queries.ts :
-- statuts exclusifs (un accès suspendu n'est ni activé ni non activé), les
-- compteurs par statut suivent le type choisi, ceux par type le statut choisi.
-- =============================================================================

create or replace function public.access_overview(p_school uuid, p_kind text default null, p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not app.can_read(p_school, 'access_accounts.view') then
    raise exception 'Droit requis : consulter les accès.' using errcode = '42501';
  end if;

  with a as (
    select subject_kind::text as kind,
           case when account_status::text = 'SUSPENDED' then 'SUSPENDED'
                when activation_status::text = 'ACTIVATED' then 'ACTIVATED'
                else 'NOT_ACTIVATED' end as st
    from account_access
    where school_id = p_school
  ),
  d as (
    select count(*) filter (where status::text = 'PENDING') as pending,
           count(*) filter (where status::text = 'SENT') as sent,
           count(*) filter (where status::text = 'FAILED') as failed
    from credential_deliveries
    where school_id = p_school
  )
  select jsonb_build_object(
    'byStatus', jsonb_build_object(
      'ALL',           count(*) filter (where p_kind is null or kind = p_kind),
      'NOT_ACTIVATED', count(*) filter (where (p_kind is null or kind = p_kind) and st = 'NOT_ACTIVATED'),
      'ACTIVATED',     count(*) filter (where (p_kind is null or kind = p_kind) and st = 'ACTIVATED'),
      'SUSPENDED',     count(*) filter (where (p_kind is null or kind = p_kind) and st = 'SUSPENDED')),
    'byKind', jsonb_build_object(
      'ALL',      count(*) filter (where p_status is null or st = p_status),
      'TEACHER',  count(*) filter (where (p_status is null or st = p_status) and kind = 'TEACHER'),
      'GUARDIAN', count(*) filter (where (p_status is null or st = p_status) and kind = 'GUARDIAN'),
      'STAFF',    count(*) filter (where (p_status is null or st = p_status) and kind = 'STAFF')),
    'sms', (select jsonb_build_object('pending', d.pending, 'sent', d.sent, 'failed', d.failed) from d)
  )
  into v
  from a;
  return v;
end;
$$;
revoke all on function public.access_overview(uuid, text, text) from public, anon;
grant execute on function public.access_overview(uuid, text, text) to authenticated;
