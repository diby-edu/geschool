-- =============================================================================
-- 0116 — Heures faites par enseignant, et paie à l'heure
-- =============================================================================
--
-- Décidé le 2026-10-15 :
--   - Un enseignant est VACATAIRE ou PERMANENT.
--   - Vacataire : TOUTES ses heures faites sont payées au taux vacataire.
--   - Permanent : un quota d'heures par semaine (le maximum de son service :
--     16 h, 18 h…, réglé pour l'école et modifiable sur sa fiche). Les heures
--     au-delà, SEMAINE PAR SEMAINE, sont des heures supplémentaires payées au
--     taux des heures supplémentaires.
--   - Taux : un pour l'école (réglages), modifiable sur la fiche (ci-dessous).
--   - 1 cours = 1 heure. Une heure FAITE est un cours dont l'appel a été fait :
--     l'appel atteste la présence de l'enseignant.
--
-- Droit : `teachers.payroll` (direction, comptable, fondateur par défaut).
-- =============================================================================

insert into permissions (code, module, action, description, is_platform_only) values
  ('teachers.payroll', 'teachers', 'payroll', 'Consulter les heures faites et la paie a l''heure des enseignants', false)
on conflict (code) do nothing;

with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on r.code = any (array['SCHOOL_ADMIN', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'ACCOUNTANT'])
  where p.code = 'teachers.payroll'
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;

-- Taux propre à un enseignant : vacataire -> son taux horaire ; permanent ->
-- son taux d'heures supplémentaires. Vide = le taux de l'école.
alter table teachers add column if not exists hourly_rate numeric(10,2);
alter table teachers drop constraint if exists teachers_hourly_rate_positive;
alter table teachers add constraint teachers_hourly_rate_positive check (hourly_rate is null or hourly_rate >= 0);
comment on column teachers.hourly_rate is
  'Taux propre : vacataire = taux horaire ; permanent = taux des heures supplementaires. Vide = taux de l''ecole.';

-- Les cours d'une période, enseignant par enseignant : jour, heure, heures de
-- cours (1 cours = 1 h par créneau), appel fait ou non. Un remplaçant prend la
-- place de l'enseignant prévu. Les cours annulés et ceux à venir sont exclus.
create or replace function public.teacher_course_hours(p_school uuid, p_from date, p_to date)
returns table (teacher_id uuid, occurs_on date, starts_at timestamptz, hours integer, done boolean, class_name text, subject text)
language sql stable security definer set search_path = public, pg_temp
as $$
  with sess as (
    select ss.id, app.session_course_hours(ss.id) as hours, sj.name as subject,
           (select string_agg(c.name, ' + ' order by c.name) from schedule_session_targets t join classes c on c.id = t.class_id where t.session_id = ss.id) as class_name
    from schedule_sessions ss
    join subjects sj on sj.id = ss.subject_id
    where ss.school_id = p_school
      and ss.id in (select o.schedule_session_id from session_occurrences o
                     where o.school_id = p_school and o.occurs_on between p_from and p_to)
  ),
  occ as (
    select o.*
    from session_occurrences o
    where o.school_id = p_school
      and o.occurs_on between p_from and p_to
      and o.status <> 'CANCELLED'
      and coalesce(o.override_starts_at, o.starts_at) < now()
  )
  select who.teacher_id, o.occurs_on, coalesce(o.override_starts_at, o.starts_at), s.hours,
         exists (select 1 from attendance_registers r where r.session_occurrence_id = o.id),
         s.class_name, s.subject
  from occ o
  join sess s on s.id = o.schedule_session_id
  cross join lateral (
    select o.override_teacher_id as teacher_id where o.override_teacher_id is not null
    union all
    select st.teacher_id from schedule_session_teachers st
    where st.session_id = o.schedule_session_id and o.override_teacher_id is null
  ) who
  where app.is_platform_admin() or app.can_read(p_school, 'teachers.payroll')
$$;

revoke all on function public.teacher_course_hours(uuid, date, date) from public, anon;
grant execute on function public.teacher_course_hours(uuid, date, date) to authenticated;
