-- =============================================================================
-- 0055 — Suivi du jour (tableau de bord de la direction)
-- =============================================================================
--
-- Lectures agregees pour le tableau de bord, protegees par UN seul controle de
-- droit (`attendance.view_all`) au lieu d'une evaluation de politique par ligne :
-- lues sous RLS, les memes requetes multiplient le cout par 10 (voir 0052).
--
-- Regles metier validees avec la direction :
--   * Une seance est « attendue » a la FIN de son creneau (1 h, 2 h ou 4 h : un
--     seul appel par seance). Le total change donc a chaque fin de creneau.
--   * Les eleves comptes sont ceux des seances TERMINEES ET APPELEES. Un eleve
--     absent a une seance est absent pour la journee ; en retard s'il n'est pas
--     absent mais en retard une fois ; present sinon.
--   * Une classe dont l'appel n'a pas ete fait n'est comptee NI presente NI
--     absente : ses eleves sont signales a part (« sans appel »).
--   * Une absence justifiee = statut EXCUSED sans aucune absence simple, ou un
--     justificatif approuve qui couvre le jour.
--   * Le taux d'assiduite d'une periode = (presents + retards) / pointages.
--
-- Aucune table n'est modifiee : uniquement des fonctions. Rejouable.

-- -----------------------------------------------------------------------------
-- 0. Seances d'une periode, avec classe, enseignant effectif et appel (interne)
-- -----------------------------------------------------------------------------
-- L'horaire et l'enseignant effectifs tiennent compte des deplacements et des
-- remplacements (colonnes override_*). Les seances annulees ou deplacees sont
-- exclues. `register_id` n'est renseigne que pour un appel SOUMIS ou VALIDE.
create or replace function app.dashboard_occurrences(p_school uuid, p_from date, p_to date)
returns table (
  occ_id      uuid,
  occurs_on   date,
  s_at        timestamptz,
  e_at        timestamptz,
  subject_id  uuid,
  class_id    uuid,
  teacher_id  uuid,
  register_id uuid,
  taken_at    timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    o.id,
    o.occurs_on,
    coalesce(o.override_starts_at, o.starts_at),
    coalesce(o.override_ends_at, o.ends_at),
    ss.subject_id,
    (select t.class_id from schedule_session_targets t
      where t.session_id = ss.id and t.target_type = 'CLASS' order by t.id limit 1),
    coalesce(
      o.override_teacher_id,
      (select st.teacher_id from schedule_session_teachers st
        where st.session_id = ss.id order by (st.role = 'LEAD') desc, st.teacher_id limit 1)
    ),
    r.id,
    r.taken_at
  from session_occurrences o
  join schedule_sessions ss on ss.id = o.schedule_session_id
  left join attendance_registers r
    on r.session_occurrence_id = o.id and r.status in ('SUBMITTED', 'VALIDATED')
  where o.school_id = p_school
    and o.occurs_on between p_from and p_to
    and o.status not in ('CANCELLED', 'MOVED')
$$;
revoke all on function app.dashboard_occurrences(uuid, date, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Chiffres du jour : appels et presence (une ligne JSON)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_day_overview(p_school uuid, p_day date, p_now timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not app.can_read(p_school, 'attendance.view_all') then
    raise exception 'Droit requis : consulter toutes les presences.' using errcode = '42501';
  end if;

  with occ as (
    select * from app.dashboard_occurrences(p_school, p_day, p_day)
  ),
  calls as (
    select
      count(*)::int                                                          as total,
      count(*) filter (where e_at <= p_now)::int                             as expected,
      count(*) filter (where e_at <= p_now and register_id is not null)::int as done,
      count(*) filter (where e_at <= p_now and register_id is null)::int     as missed,
      count(*) filter (where s_at <= p_now and e_at > p_now)::int            as ongoing,
      count(*) filter (where s_at > p_now)::int                              as upcoming
    from occ
  ),
  per as (
    select ar.student_id,
           bool_or(ar.status = 'ABSENT')  as plain_abs,
           bool_or(ar.status = 'EXCUSED') as exc,
           bool_or(ar.status = 'LATE')    as late
    from occ o
    join attendance_records ar on ar.register_id = o.register_id
    where o.e_at <= p_now
    group by ar.student_id
  ),
  stu as (
    select
      count(*)::int as counted,
      count(*) filter (where plain_abs or exc)::int as absent,
      count(*) filter (
        where (plain_abs or exc)
          and ((exc and not plain_abs) or exists (
            select 1 from absence_justifications j
            where j.student_id = per.student_id and j.status = 'APPROVED'
              and p_day between j.covers_from and j.covers_to))
      )::int as justified,
      count(*) filter (where not (plain_abs or exc) and late)::int as late
    from per
  ),
  missed_cls as (
    select distinct class_id from occ
    where e_at <= p_now and register_id is null and class_id is not null
  ),
  nocall as (
    select e.student_id, e.class_id
    from student_enrollments e
    join missed_cls m on m.class_id = e.class_id
    where e.school_id = p_school
      and e.status = 'ENROLLED'
      and not exists (select 1 from per where per.student_id = e.student_id)
  )
  select jsonb_build_object(
    'total', calls.total,
    'expected', calls.expected,
    'done', calls.done,
    'missed', calls.missed,
    'ongoing', calls.ongoing,
    'upcoming', calls.upcoming,
    'counted', stu.counted,
    'absent', stu.absent,
    'justified', stu.justified,
    'late', stu.late,
    'present', stu.counted - stu.absent - stu.late,
    'nocall_students', (select count(distinct student_id) from nocall)::int,
    'nocall_classes', (select count(distinct class_id) from nocall)::int
  )
  into v
  from calls, stu;

  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Seances du jour (detail des appels : effectues / non faits / en cours / a venir)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_day_sessions(p_school uuid, p_day date, p_now timestamptz)
returns table (
  occurrence_id uuid,
  starts_at     timestamptz,
  ends_at       timestamptz,
  phase         text,
  called        boolean,
  taken_at      timestamptz,
  class_name    text,
  subject_name  text,
  teacher_id    uuid,
  teacher_name  text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_read(p_school, 'attendance.view_all') then
    raise exception 'Droit requis : consulter toutes les presences.' using errcode = '42501';
  end if;
  return query
  select
    o.occ_id,
    o.s_at,
    o.e_at,
    case
      when o.e_at <= p_now then (case when o.register_id is not null then 'done' else 'missed' end)
      when o.s_at <= p_now then 'ongoing'
      else 'upcoming'
    end,
    o.register_id is not null,
    o.taken_at,
    c.name,
    s.name,
    o.teacher_id,
    nullif(btrim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')), '')
  from app.dashboard_occurrences(p_school, p_day, p_day) o
  left join classes  c on c.id = o.class_id
  left join subjects s on s.id = o.subject_id
  left join teachers t on t.id = o.teacher_id
  order by o.s_at, c.name
  limit 600;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Presence classe par classe (eleves comptes)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_day_presence_by_class(p_school uuid, p_day date, p_now timestamptz)
returns table (class_id uuid, class_name text, counted int, present int, late int, absent int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_read(p_school, 'attendance.view_all') then
    raise exception 'Droit requis : consulter toutes les presences.' using errcode = '42501';
  end if;
  return query
  select c.id, c.name,
         count(*)::int,
         count(*) filter (where not x.abs and not x.late)::int,
         count(*) filter (where not x.abs and x.late)::int,
         count(*) filter (where x.abs)::int
  from (
    select o.class_id, ar.student_id,
           bool_or(ar.status in ('ABSENT', 'EXCUSED')) as abs,
           bool_or(ar.status = 'LATE') as late
    from app.dashboard_occurrences(p_school, p_day, p_day) o
    join attendance_records ar on ar.register_id = o.register_id
    where o.e_at <= p_now and o.class_id is not null
    group by o.class_id, ar.student_id
  ) x
  join classes c on c.id = x.class_id
  group by c.id, c.name
  order by c.name;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Liste des absents ou des retards du jour
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_day_students(
  p_school uuid, p_day date, p_now timestamptz, p_kind text, p_limit int default 40
)
returns table (
  student_id   uuid,
  last_name    text,
  first_name   text,
  class_name   text,
  justified    boolean,
  minutes_late int,
  total        bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_read(p_school, 'attendance.view_all') then
    raise exception 'Droit requis : consulter toutes les presences.' using errcode = '42501';
  end if;
  if p_kind not in ('absent', 'late') then
    raise exception 'Type inconnu.' using errcode = '22023';
  end if;
  return query
  with per as (
    select o.class_id, ar.student_id,
           bool_or(ar.status = 'ABSENT')  as plain_abs,
           bool_or(ar.status = 'EXCUSED') as exc,
           bool_or(ar.status = 'LATE')    as late,
           max(ar.minutes_late)           as ml
    from app.dashboard_occurrences(p_school, p_day, p_day) o
    join attendance_records ar on ar.register_id = o.register_id
    where o.e_at <= p_now and o.class_id is not null
    group by o.class_id, ar.student_id
  )
  select s.id, s.last_name, s.first_name, c.name,
         ((per.exc and not per.plain_abs) or exists (
            select 1 from absence_justifications j
            where j.student_id = per.student_id and j.status = 'APPROVED'
              and p_day between j.covers_from and j.covers_to)),
         coalesce(per.ml, 0)::int,
         count(*) over ()
  from per
  join students s on s.id = per.student_id
  join classes c on c.id = per.class_id
  where (p_kind = 'absent' and (per.plain_abs or per.exc))
     or (p_kind = 'late' and not (per.plain_abs or per.exc) and per.late)
  order by c.name, s.last_name, s.first_name
  limit greatest(p_limit, 1);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Classes dont l'appel n'a pas ete fait a la fin du creneau (eleves « sans appel »)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_day_no_call(p_school uuid, p_day date, p_now timestamptz)
returns table (class_id uuid, class_name text, uncounted int, sessions jsonb)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_read(p_school, 'attendance.view_all') then
    raise exception 'Droit requis : consulter toutes les presences.' using errcode = '42501';
  end if;
  return query
  with occ as (
    select * from app.dashboard_occurrences(p_school, p_day, p_day)
  ),
  counted as (
    select distinct ar.student_id
    from occ o join attendance_records ar on ar.register_id = o.register_id
    where o.e_at <= p_now
  ),
  missed as (
    select * from occ where occ.e_at <= p_now and occ.register_id is null and occ.class_id is not null
  )
  select m.class_id, c.name,
         (select count(*) from student_enrollments e
           where e.school_id = p_school and e.class_id = m.class_id and e.status = 'ENROLLED'
             and not exists (select 1 from counted k where k.student_id = e.student_id))::int,
         jsonb_agg(jsonb_build_object(
           'starts_at', m.s_at, 'ends_at', m.e_at,
           'subject', s.name, 'teacher_id', m.teacher_id,
           'teacher', nullif(btrim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')), '')
         ) order by m.s_at)
  from missed m
  join classes c on c.id = m.class_id
  left join subjects s on s.id = m.subject_id
  left join teachers t on t.id = m.teacher_id
  group by m.class_id, c.name
  order by c.name;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Top des enseignants ayant oublie l'appel (jour, semaine ou mois)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_top_missed_calls(
  p_school uuid, p_from date, p_to date, p_now timestamptz, p_limit int default 5
)
returns table (teacher_id uuid, teacher_name text, subjects text, missed int, expected int)
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
  select r.teacher_id, r.teacher_name, r.subjects, r.missed, r.expected
  from (
    select o.teacher_id,
           nullif(btrim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')), '') as teacher_name,
           string_agg(distinct s.name, ', ') as subjects,
           (count(*) filter (where o.register_id is null))::int as missed,
           count(*)::int as expected
    from app.dashboard_occurrences(p_school, p_from, p_to) o
    join teachers t on t.id = o.teacher_id
    left join subjects s on s.id = o.subject_id
    where o.e_at <= p_now
    group by o.teacher_id, t.first_name, t.last_name
  ) r
  where r.missed > 0
  order by r.missed desc, (r.missed::numeric / r.expected) desc, r.teacher_name
  limit greatest(p_limit, 1);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Detail d'un enseignant : appels manques sur une periode
-- -----------------------------------------------------------------------------
-- Le telephone n'est renvoye qu'a qui peut consulter les enseignants.
create or replace function public.dashboard_teacher_call_detail(
  p_school uuid, p_teacher uuid, p_from date, p_to date, p_now timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not app.can_read(p_school, 'attendance.view_all') then
    raise exception 'Droit requis : consulter toutes les presences.' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Periode invalide.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'teacher_id', t.id,
    'name', nullif(btrim(t.first_name || ' ' || t.last_name), ''),
    'phone', case when app.can_read(p_school, 'teachers.view') then t.phone_e164 end,
    'employment_type', t.employment_type,
    'specialty', t.specialty,
    'missed', (select count(*) from app.dashboard_occurrences(p_school, p_from, p_to) o
                where o.teacher_id = t.id and o.e_at <= p_now and o.register_id is null),
    'expected', (select count(*) from app.dashboard_occurrences(p_school, p_from, p_to) o
                  where o.teacher_id = t.id and o.e_at <= p_now),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', x.occurs_on, 'starts_at', x.s_at, 'ends_at', x.e_at,
               'class', x.class_name, 'subject', x.subject_name)
             order by x.s_at desc)
      from (
        select o.occurs_on, o.s_at, o.e_at, c.name as class_name, s.name as subject_name
        from app.dashboard_occurrences(p_school, p_from, p_to) o
        left join classes c on c.id = o.class_id
        left join subjects s on s.id = o.subject_id
        where o.teacher_id = t.id and o.e_at <= p_now and o.register_id is null
        order by o.s_at desc
        limit 30
      ) x
    ), '[]'::jsonb)
  )
  into v
  from teachers t
  where t.id = p_teacher and t.school_id = p_school;

  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Assiduite : classes a surveiller et courbe hebdomadaire
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_low_attendance_classes(
  p_school uuid, p_from date, p_to date, p_now timestamptz, p_limit int default 6
)
returns table (class_id uuid, class_name text, rate numeric, unjustified int, records int)
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
  select c.id, c.name,
         round(100.0 * (count(*) filter (where ar.status in ('PRESENT', 'LATE'))) / count(*), 1),
         (count(*) filter (where ar.status = 'ABSENT'))::int,
         count(*)::int
  from app.dashboard_occurrences(p_school, p_from, p_to) o
  join attendance_records ar on ar.register_id = o.register_id
  join classes c on c.id = o.class_id
  where o.e_at <= p_now
  group by c.id, c.name
  order by 3 asc, c.name
  limit greatest(p_limit, 1);
end;
$$;

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
         count(*)::int,
         (count(*) filter (where ar.status in ('PRESENT', 'LATE')))::int
  from app.dashboard_occurrences(p_school, p_from, p_to) o
  join attendance_records ar on ar.register_id = o.register_id
  where o.e_at <= p_now
  group by 1
  order by 1;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Droits d'appel : reserves aux utilisateurs connectes (le droit est verifie dedans)
-- -----------------------------------------------------------------------------
revoke all on function public.dashboard_day_overview(uuid, date, timestamptz) from public, anon;
revoke all on function public.dashboard_day_sessions(uuid, date, timestamptz) from public, anon;
revoke all on function public.dashboard_day_presence_by_class(uuid, date, timestamptz) from public, anon;
revoke all on function public.dashboard_day_students(uuid, date, timestamptz, text, int) from public, anon;
revoke all on function public.dashboard_day_no_call(uuid, date, timestamptz) from public, anon;
revoke all on function public.dashboard_top_missed_calls(uuid, date, date, timestamptz, int) from public, anon;
revoke all on function public.dashboard_teacher_call_detail(uuid, uuid, date, date, timestamptz) from public, anon;
revoke all on function public.dashboard_low_attendance_classes(uuid, date, date, timestamptz, int) from public, anon;
revoke all on function public.dashboard_weekly_attendance(uuid, date, date, timestamptz) from public, anon;
grant execute on function public.dashboard_day_overview(uuid, date, timestamptz) to authenticated;
grant execute on function public.dashboard_day_sessions(uuid, date, timestamptz) to authenticated;
grant execute on function public.dashboard_day_presence_by_class(uuid, date, timestamptz) to authenticated;
grant execute on function public.dashboard_day_students(uuid, date, timestamptz, text, int) to authenticated;
grant execute on function public.dashboard_day_no_call(uuid, date, timestamptz) to authenticated;
grant execute on function public.dashboard_top_missed_calls(uuid, date, date, timestamptz, int) to authenticated;
grant execute on function public.dashboard_teacher_call_detail(uuid, uuid, date, date, timestamptz) to authenticated;
grant execute on function public.dashboard_low_attendance_classes(uuid, date, date, timestamptz, int) to authenticated;
grant execute on function public.dashboard_weekly_attendance(uuid, date, date, timestamptz) to authenticated;
