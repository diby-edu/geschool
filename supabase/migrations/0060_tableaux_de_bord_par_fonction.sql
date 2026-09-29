-- =============================================================================
-- 0060 — Tableaux de bord par fonction : trois calculs d'ensemble
-- =============================================================================
--
-- Chaque fonction du personnel reçoit ses propres indicateurs (directeur :
-- pédagogie ; censeur : assiduité ; surveillant général : vie scolaire ;
-- inspecteur : qualité pédagogique…). Trois d'entre eux portent sur TOUT
-- l'établissement et seraient trop lents ligne par ligne sous la RLS : comme
-- les fonctions de 0055/0056, ils sont calculés ici en une requête, après
-- avoir vérifié UNE fois le droit qui protège leurs données.
--
--   dashboard_class_averages      moyenne générale de chaque classe sur une
--                                 période                  (grades.view_all)
--   dashboard_assessment_activity évaluations de la période : à clôturer, en
--                                 retard, par enseignant   (assessments.view)
--   dashboard_top_absent_students élèves les plus absents sur une période
--                                                          (attendance.view_all)
--
-- Additif : aucune table modifiée.

-- -----------------------------------------------------------------------------
-- 1. Moyenne générale par classe
-- -----------------------------------------------------------------------------
-- Même règle que app.student_subject_average / app.student_period_average
-- (0022, 0038), avec les paramètres de l'application (sur 20, absent non
-- compté, évaluations clôturées ou publiées seulement), mais en une seule
-- requête ensembliste : moyenne par élève et matière (pondérée par le
-- coefficient de l'évaluation), puis moyenne générale de l'élève (pondérée par
-- le coefficient du programme de SON niveau), puis moyenne de la classe.
-- L'arrondi n'intervient qu'à l'affichage.
create or replace function public.dashboard_class_averages(p_school uuid, p_period uuid)
returns table (
  class_id     uuid,
  class_name   text,
  level_name   text,
  enrolled     int,
  graded       int,
  average      numeric,
  below_10     int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
-- Agrégat de toutes les notes de la période : assez de mémoire pour ne pas
-- déborder sur disque (grand établissement : ~200 000 notes par trimestre).
set work_mem = '32MB'
as $$
begin
  if not app.can_read(p_school, 'grades.view_all') then
    raise exception 'Droit requis : consulter toutes les notes.' using errcode = '42501';
  end if;

  return query
  with period as (
    select ap.academic_year_id from academic_periods ap
    where ap.id = p_period and ap.school_id = p_school
  ),
  enr as (
    select se.student_id, se.class_id, c.level_id
    from student_enrollments se
    join period p on p.academic_year_id = se.academic_year_id
    join classes c on c.id = se.class_id
    where se.school_id = p_school and se.status = 'ENROLLED'
  ),
  subject_avg as (
    select g.student_id, a.subject_id,
           sum(g.score / a.max_score * a.coefficient) / nullif(sum(a.coefficient), 0) * 20 as avg
    from assessments a
    join assessment_types t on t.id = a.assessment_type_id
    join grades g on g.assessment_id = a.id
    where a.school_id = p_school
      and a.academic_period_id = p_period
      and a.status in ('CLOSED', 'PUBLISHED')
      and t.counts_in_average
      and not g.is_excluded_from_average
      and not g.is_absent
      and g.score is not null
    group by g.student_id, a.subject_id
  ),
  student_avg as (
    select e.class_id, e.student_id,
           sum(s.avg * ls.coefficient) / nullif(sum(ls.coefficient), 0) as avg
    from enr e
    join subject_avg s on s.student_id = e.student_id
    join level_subjects ls on ls.level_id = e.level_id and ls.subject_id = s.subject_id
    where s.avg is not null
    group by e.class_id, e.student_id
  )
  select c.id, c.name, l.name,
         (select count(*) from enr where enr.class_id = c.id)::int,
         count(sa.avg)::int,
         avg(sa.avg),
         (count(*) filter (where sa.avg < 10))::int
  from classes c
  join period p on p.academic_year_id = c.academic_year_id
  left join levels l on l.id = c.level_id
  left join student_avg sa on sa.class_id = c.id
  where c.school_id = p_school and c.status = 'ACTIVE'
  group by c.id, c.name, l.name, l.sequence
  order by l.sequence nulls last, c.name;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Évaluations de la période : suivi par enseignant
-- -----------------------------------------------------------------------------
-- « À clôturer » : date passée, toujours en brouillon ou ouverte (notes pas
-- encore arrêtées). « En retard » : dans ce cas depuis plus de p_late_days
-- jours. « Sans note » : date passée et aucune note saisie. Les enseignants
-- affectés (affectations actives de l'année) sans aucune évaluation sur la
-- période sont listés aussi.
create or replace function public.dashboard_assessment_activity(
  p_school uuid, p_period uuid, p_today date, p_late_days int default 14, p_limit int default 8
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
  if not app.can_read(p_school, 'assessments.view') then
    raise exception 'Droit requis : consulter les évaluations.' using errcode = '42501';
  end if;

  with period as (
    select ap.academic_year_id from academic_periods ap
    where ap.id = p_period and ap.school_id = p_school
  ),
  ev as (
    select a.id, a.teacher_id, a.status, a.assessment_date,
           (a.assessment_date is not null and a.assessment_date <= p_today and a.status in ('DRAFT', 'OPEN')) as to_close,
           (a.assessment_date is not null and a.assessment_date < p_today - p_late_days and a.status in ('DRAFT', 'OPEN')) as late,
           (a.assessment_date is not null and a.assessment_date <= p_today
              and not exists (select 1 from grades g where g.assessment_id = a.id)) as no_grades
    from assessments a
    where a.school_id = p_school and a.academic_period_id = p_period
  ),
  assigned as (
    select distinct ta.teacher_id
    from teaching_assignments ta
    join period p on p.academic_year_id = ta.academic_year_id
    where ta.school_id = p_school and ta.status = 'ACTIVE'
  ),
  per_teacher as (
    select t.id as teacher_id,
           nullif(btrim(upper(t.last_name) || ' ' || t.first_name), '') as name,
           count(ev.id)::int as total,
           (count(ev.id) filter (where ev.to_close))::int as to_close,
           (count(ev.id) filter (where ev.late))::int as late,
           max(ev.assessment_date) as last_date
    from teachers t
    left join ev on ev.teacher_id = t.id
    where t.school_id = p_school and t.deleted_at is null
      and (t.id in (select teacher_id from assigned) or ev.id is not null)
    group by t.id, t.last_name, t.first_name
  )
  select jsonb_build_object(
    'total', (select count(*) from ev)::int,
    'to_close', (select count(*) filter (where to_close) from ev)::int,
    'late', (select count(*) filter (where late) from ev)::int,
    'no_grades', (select count(*) filter (where no_grades) from ev)::int,
    'closed', (select count(*) filter (where status = 'CLOSED') from ev)::int,
    'published', (select count(*) filter (where status = 'PUBLISHED') from ev)::int,
    'teachers_assigned', (select count(*) from assigned)::int,
    'teachers_without', (select count(*) from per_teacher where total = 0)::int,
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'teacher_id', x.teacher_id, 'name', x.name, 'total', x.total,
               'to_close', x.to_close, 'late', x.late, 'last_date', x.last_date)
             order by x.late desc, x.to_close desc, x.total asc, x.name)
      from (select * from per_teacher
            order by late desc, to_close desc, total asc, name
            limit greatest(p_limit, 1)) x
    ), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Élèves les plus absents sur une période
-- -----------------------------------------------------------------------------
-- Un élève compte une absence par séance appelée où il est noté absent
-- (ABSENT ou EXCUSED) ; « non justifiées » = ABSENT sans justificatif approuvé
-- couvrant ce jour. Retards : séances notées LATE.
create or replace function public.dashboard_top_absent_students(
  p_school uuid, p_from date, p_to date, p_now timestamptz, p_limit int default 8
)
returns table (
  student_id   uuid,
  last_name    text,
  first_name   text,
  class_name   text,
  absences     int,
  unjustified  int,
  lates        int,
  total        int
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
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Periode invalide.' using errcode = '22023';
  end if;

  return query
  with rec as (
    select ar.student_id, ar.status, o.occurs_on
    from app.dashboard_occurrences(p_school, p_from, p_to) o
    join attendance_records ar on ar.register_id = o.register_id
    where o.e_at <= p_now and ar.status in ('ABSENT', 'EXCUSED', 'LATE')
  ),
  agg as (
    select r.student_id,
           (count(*) filter (where r.status in ('ABSENT', 'EXCUSED')))::int as absences,
           (count(*) filter (
             where r.status = 'ABSENT'
               and not exists (
                 select 1 from absence_justifications j
                 where j.student_id = r.student_id and j.status = 'APPROVED'
                   and r.occurs_on between j.covers_from and j.covers_to)
           ))::int as unjustified,
           (count(*) filter (where r.status = 'LATE'))::int as lates
    from rec r
    group by r.student_id
  ),
  ranked as (
    select a.*, count(*) over ()::int as n
    from agg a
    where a.absences > 0
  )
  select s.id, s.last_name, s.first_name,
         (select c.name from student_enrollments se join classes c on c.id = se.class_id
           where se.student_id = s.id and se.status = 'ENROLLED'
           order by se.created_at desc limit 1),
         rk.absences, rk.unjustified, rk.lates, rk.n
  from ranked rk
  join students s on s.id = rk.student_id
  order by rk.absences desc, rk.unjustified desc, s.last_name, s.first_name
  limit greatest(p_limit, 1);
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'appel : utilisateurs connectés (le droit est vérifié dedans)
-- -----------------------------------------------------------------------------
revoke all on function public.dashboard_class_averages(uuid, uuid) from public, anon;
revoke all on function public.dashboard_assessment_activity(uuid, uuid, date, int, int) from public, anon;
revoke all on function public.dashboard_top_absent_students(uuid, date, date, timestamptz, int) from public, anon;
grant execute on function public.dashboard_class_averages(uuid, uuid) to authenticated;
grant execute on function public.dashboard_assessment_activity(uuid, uuid, date, int, int) to authenticated;
grant execute on function public.dashboard_top_absent_students(uuid, date, date, timestamptz, int) to authenticated;
