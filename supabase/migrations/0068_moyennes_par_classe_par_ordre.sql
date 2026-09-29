-- =============================================================================
-- 0068 — Moyennes par classe : seulement les classes de l'ordre de la période
-- =============================================================================
--
-- Depuis 0066, une année peut porter deux découpages : trimestres du général,
-- semestres du technique et du professionnel. Le bloc « Moyennes par classe »
-- du tableau de bord interroge UNE période ; il listait alors toutes les classes
-- de l'établissement, y compris celles d'un autre ordre, forcément sans note
-- (leurs évaluations sont rangées dans leur propre découpage).
--
-- Une période qui vise des ordres (tracks non nul) ne montre donc que les
-- classes de ces ordres. Une période commune (tracks nul) les montre toutes,
-- comme avant.

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
    select ap.academic_year_id, ap.tracks from academic_periods ap
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
  left join cycles cy on cy.id = l.cycle_id
  left join student_avg sa on sa.class_id = c.id
  where c.school_id = p_school and c.status = 'ACTIVE'
    -- La classe suit l'ordre de son cycle ; une période sans ordre vaut pour tous.
    and (p.tracks is null or coalesce(cy.track, 'GENERAL'::education_track) = any(p.tracks))
  group by c.id, c.name, l.name, l.sequence
  order by l.sequence nulls last, c.name;
end;
$$;
