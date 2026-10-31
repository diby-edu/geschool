-- =============================================================================
-- 0170 — L'appel heure par heure
-- =============================================================================
-- Décidé le 2026-10-31 (maquette docs/maquettes/appel-par-heure.html) :
--   * deux états seulement, présent ou absent : le retard disparaît de l'appel ;
--   * un cours de plusieurs heures se fait en autant d'appels que d'heures
--     (1 cours = 1 h, 0115) ; chaque heure se fait pendant cette heure ;
--   * l'heure suivante reprend les absents de la précédente (écran) ;
--   * une heure absent = 1 h d'absence ; une heure sans appel = appel manquant,
--     non payée.
--
-- Modèle : un cours garde UN registre et chaque élève UNE ligne — tout ce qui
-- compte des appels ou des élèves absents (tableaux de bord, listes, totaux
-- 0160) reste juste sans changer. On y ajoute :
--   attendance_registers.hours_taken  : pour chaque heure, l'instant où son
--                                       appel a été validé (null = pas fait) ;
--   attendance_records.absent_hours   : les heures où l'élève était absent.
-- Un élève est ABSENT (ou EXCUSÉ) s'il a manqué au moins une heure.
--
-- Les heures d'une séance sont découpées à parts égales entre son début et sa
-- fin : un cours de 14 h à 17 h a trois heures, 14-15, 15-16, 16-17.
--
-- Données existantes : un appel soumis ou validé a toutes ses heures faites ;
-- une absence porte sur toutes les heures du cours (c'était la règle). Les
-- retards déjà saisis restent tels quels : ils comptent comme présents.
-- =============================================================================

alter table attendance_registers add column if not exists hours_taken timestamptz[] not null default '{}';
alter table attendance_records add column if not exists absent_hours smallint[] not null default '{}';

comment on column attendance_registers.hours_taken is
  'Heure k du cours (1 = la première) : instant où son appel a été validé ; null = pas fait (0170).';
comment on column attendance_records.absent_hours is
  'Heures du cours où l''élève était absent (1 = la première). Vide si présent (0170).';

-- -----------------------------------------------------------------------------
-- 1. Outils
-- -----------------------------------------------------------------------------

/** Nombre d'heures faites d'un appel. */
create or replace function app.hours_done(p_hours timestamptz[])
returns integer
language sql
immutable
as $$
  select count(*)::int from unnest(p_hours) h where h is not null
$$;

/** Heures d'un cours daté (le nombre de créneaux de sa séance, au moins 1). */
create or replace function app.occurrence_course_hours(p_occurrence uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.session_course_hours(o.schedule_session_id)
  from session_occurrences o
  where o.id = p_occurrence
$$;

/** L'heure du cours (1, 2, 3…) qui couvre l'instant p_at ; null hors du cours. */
create or replace function app.occurrence_hour_at(p_occurrence uuid, p_at timestamptz)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when p_at < x.s or p_at >= x.e then null
           else least(x.n, 1 + floor(extract(epoch from (p_at - x.s)) / (extract(epoch from (x.e - x.s)) / x.n))::int)
         end
  from (
    select coalesce(o.override_starts_at, o.starts_at) as s,
           coalesce(o.override_ends_at, o.ends_at) as e,
           app.session_course_hours(o.schedule_session_id) as n
    from session_occurrences o
    where o.id = p_occurrence
  ) x
  where x.e > x.s
$$;

grant execute on function app.hours_done(timestamptz[]) to authenticated, service_role;
grant execute on function app.occurrence_course_hours(uuid) to authenticated, service_role;
grant execute on function app.occurrence_hour_at(uuid, timestamptz) to authenticated, service_role;

/** Pour l'écran d'appel : le nombre d'heures d'un cours de l'établissement. */
create or replace function public.occurrence_course_hours(p_school uuid, p_occurrence uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.occurrence_course_hours(o.id)
  from session_occurrences o
  where o.id = p_occurrence
    and o.school_id = p_school
    and (app.is_platform_admin() or app.is_member_of(p_school))
$$;
revoke all on function public.occurrence_course_hours(uuid, uuid) from public, anon;
grant execute on function public.occurrence_course_hours(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Données existantes (avant le déclencheur, en une passe par séance)
-- -----------------------------------------------------------------------------

alter table attendance_records disable trigger attendance_records_touch;

with reg as (
  select g.id, app.session_course_hours(o.schedule_session_id) as n
  from attendance_registers g
  join session_occurrences o on o.id = g.session_occurrence_id
)
update attendance_records r
set absent_hours = array(select generate_series(1, reg.n)::smallint)
from reg
where reg.id = r.register_id
  and r.status in ('ABSENT', 'EXCUSED')
  and cardinality(r.absent_hours) = 0;

alter table attendance_records enable trigger attendance_records_touch;

with reg as (
  select g.id, g.taken_at, app.session_course_hours(o.schedule_session_id) as n
  from attendance_registers g
  join session_occurrences o on o.id = g.session_occurrence_id
  where g.status in ('SUBMITTED', 'VALIDATED')
)
update attendance_registers g
set hours_taken = array_fill(reg.taken_at, array[reg.n])
from reg
where reg.id = g.id
  and cardinality(g.hours_taken) = 0;

-- -----------------------------------------------------------------------------
-- 3. Cohérence : absent = au moins une heure ; présent = aucune
-- -----------------------------------------------------------------------------
-- Toute écriture qui ne connaît pas les heures (restauration, import, vie
-- scolaire) garde l'ancienne règle : une absence couvre tout le cours.

create or replace function app.attendance_record_hours()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if new.status in ('ABSENT', 'EXCUSED') then
    if cardinality(new.absent_hours) = 0 then
      select app.session_course_hours(o.schedule_session_id) into v_n
      from attendance_registers g
      join session_occurrences o on o.id = g.session_occurrence_id
      where g.id = new.register_id;
      new.absent_hours := array(select generate_series(1, coalesce(v_n, 1))::smallint);
    end if;
  elsif cardinality(new.absent_hours) > 0 then
    new.absent_hours := '{}';
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_records_hours on attendance_records;
create trigger attendance_records_hours
  before insert or update of status, absent_hours on attendance_records
  for each row execute function app.attendance_record_hours();

-- -----------------------------------------------------------------------------
-- 4. Valider l'appel d'UNE heure
-- -----------------------------------------------------------------------------
-- p_hour : l'heure validée. Un enseignant ne valide que l'heure en cours (ou,
-- pour un appel fait hors ligne, celle de l'instant p_at où il l'a fait).
-- Sans p_hour (ancien écran) : l'heure en cours, ou la première.

drop function if exists public.submit_attendance_register(uuid, timestamptz);
create or replace function public.submit_attendance_register(p_register uuid, p_at timestamptz default null, p_hour integer default null)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_at timestamptz := coalesce(p_at, now());
  v_n integer;
  v_hour integer;
  v_taken timestamptz[];
  v_manager boolean;
begin
  select id, school_id, session_occurrence_id, status, hours_taken
    into r
    from attendance_registers
   where id = p_register;
  if not found then
    raise exception 'Appel introuvable.' using errcode = 'P0002';
  end if;

  v_manager := app.can_write(r.school_id, 'attendance.update');
  if not (
    v_manager
    or app.can_take_attendance(r.school_id, r.session_occurrence_id)
    or (p_at is not null and app.can_take_attendance_at(r.school_id, r.session_occurrence_id, p_at))
  ) then
    raise exception 'Vous n''etes pas habilite a valider cet appel.' using errcode = '42501';
  end if;

  if r.status = 'VALIDATED' then
    return 'VALIDATED';
  end if;

  v_n := app.occurrence_course_hours(r.session_occurrence_id);
  v_hour := coalesce(app.occurrence_hour_at(r.session_occurrence_id, v_at), case when v_manager then p_hour end, 1);
  if p_hour is not null and p_hour <> v_hour and not v_manager then
    raise exception 'Cette heure n''est pas en cours : son appel ne peut plus etre fait.' using errcode = '42501';
  end if;
  if v_manager and p_hour is not null then
    v_hour := p_hour;
  end if;
  if v_hour < 1 or v_hour > v_n then
    raise exception 'Heure de cours invalide.' using errcode = '22023';
  end if;

  v_taken := r.hours_taken;
  if cardinality(v_taken) < v_n then
    v_taken := v_taken || array_fill(null::timestamptz, array[v_n - cardinality(v_taken)]);
  end if;
  v_taken[v_hour] := coalesce(v_taken[v_hour], v_at);

  update attendance_registers
     set hours_taken = v_taken,
         status = case when status = 'OPEN' then 'SUBMITTED' else status end
   where id = r.id;
  return 'SUBMITTED';
end;
$$;
revoke all on function public.submit_attendance_register(uuid, timestamptz, integer) from public, anon;
grant execute on function public.submit_attendance_register(uuid, timestamptz, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Heures d'absence : les heures manquées, plus la durée entière du cours
-- -----------------------------------------------------------------------------

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
           -- Une heure absent = 1 h (0170) ; avant, tout le cours.
           cardinality(r.absent_hours)::numeric as hours
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

-- -----------------------------------------------------------------------------
-- 6. Paie : une heure est faite quand SON appel l'est
-- -----------------------------------------------------------------------------
-- Avant : un cours avec un appel (même commencé) comptait toutes ses heures.
-- Le détail garde sa forme, avec en 7e position les heures faites.

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
  sess as materialized (
    select ss.id, app.session_course_hours(ss.id) as hours, ss.subject_id
    from schedule_sessions ss
    where ss.school_id = p_school
      and ss.id in (select distinct occ.schedule_session_id from occ)
  ),
  lines as materialized (
    select who.teacher_id as tid, o.occurs_on, o.s_at, s.hours, s.id as session_id, s.subject_id,
           least(s.hours, coalesce((select app.hours_done(r.hours_taken) from attendance_registers r
                                     where r.session_occurrence_id = o.id), 0)) as done_h
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
           sum(l.done_h)::int as done_h,
           sum(l.hours - l.done_h)::int as undone_h
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
               l.occurs_on, l.s_at, l.hours, l.done_h >= l.hours,
               (select string_agg(c.name, ' + ' order by c.name)
                  from schedule_session_targets t join classes c on c.id = t.class_id
                 where t.session_id = l.session_id),
               (select sj.name from subjects sj where sj.id = l.subject_id),
               l.done_h
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

-- -----------------------------------------------------------------------------
-- 7. Appels non faits : aussi les heures restées sans appel
-- -----------------------------------------------------------------------------
-- Un cours de 3 h dont seule la 1re heure a son appel compte 2 heures
-- manquantes. Deux colonnes de plus : heures du cours, heures sans appel.

drop function if exists public.missing_calls(uuid, date, date, timestamptz);
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
  reviewed_at timestamptz,
  course_hours integer,
  missing_hours integer
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
  with cand as materialized (
    select o.id, o.occurs_on, o.starts_at, o.ends_at, o.schedule_session_id,
           r.id as register_id, r.status as reg_status, r.hours_taken
    from session_occurrences o
    left join attendance_registers r on r.session_occurrence_id = o.id
    where o.school_id = p_school
      and o.status = 'SCHEDULED'
      and o.occurs_on between p_from and p_to
      and o.ends_at < p_now
  ),
  sess as materialized (
    select ss.id, ss.subject_id, app.session_course_hours(ss.id) as hours
    from schedule_sessions ss
    where ss.id in (select distinct schedule_session_id from cand)
  ),
  gap as (
    select c.*, s.subject_id, s.hours,
           case when c.register_id is null or c.reg_status not in ('SUBMITTED', 'VALIDATED') then s.hours
                else greatest(0, s.hours - app.hours_done(c.hours_taken)) end as missing
    from cand c
    left join sess s on s.id = c.schedule_session_id
  )
  select gp.id, gp.occurs_on, gp.starts_at, gp.ends_at,
         coalesce(sj.name, 'Cours'),
         (select c.name from schedule_session_targets t join classes c on c.id = t.class_id
           where t.session_id = gp.schedule_session_id order by t.id limit 1),
         lead.teacher_id,
         (select upper(te.last_name) || ' ' || te.first_name from teachers te where te.id = lead.teacher_id),
         g.reason, g.note, g.reviewed_at,
         coalesce(gp.hours, 1), gp.missing
  from gap gp
  left join subjects sj on sj.id = gp.subject_id
  left join attendance_gaps g on g.session_occurrence_id = gp.id
  left join lateral (
    select st.teacher_id from schedule_session_teachers st
    where st.session_id = gp.schedule_session_id
    order by (st.role = 'LEAD') desc, st.teacher_id
    limit 1
  ) lead on true
  where gp.missing > 0
  order by gp.occurs_on desc, gp.starts_at desc;
end;
$$;
revoke all on function public.missing_calls(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.missing_calls(uuid, date, date, timestamptz) to authenticated;
