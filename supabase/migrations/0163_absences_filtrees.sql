-- =============================================================================
-- 0163 — Liste des absences : filtres niveau, classe, type, élève, et tri
-- =============================================================================
-- Maquette « listes et présences », validée le 2026-10-30 : les mêmes filtres
-- sur toutes les listes. list_absences (0134) ne savait filtrer que par période.
-- Celle-ci ajoute niveau, classe, absence ou retard, recherche d'un élève, et
-- un tri (date, classe, élève).
--
-- La classe affichée est désormais celle de l'ÉLÈVE (son inscription de l'année
-- du cours), et non la première classe du cours : pour un cours commun
-- (EPS 6e A + 6e B), l'élève de 6e B apparaissait en 6e A.
--
-- Droits : les mêmes que la lecture des appels (registers_select, 0127) — tout
-- l'établissement pour qui voit toutes les présences ou tout l'emploi du temps,
-- sinon les seuls cours de la personne. Vérifiés UNE fois, au début : en
-- « security invoker », la base revérifiait les droits à chaque ligne des
-- tables jointes (inscriptions, classes…) et dépassait le délai sur un mois.
-- =============================================================================

create or replace function public.absences_page(
  p_school uuid,
  p_from   date,
  p_to     date,
  p_level  uuid default null,
  p_class  uuid default null,
  p_kind   text default null,     -- 'ABSENT' | 'LATE'
  p_q      text default null,
  p_sort   text default 'date',   -- 'date' | 'classe' | 'eleve'
  p_limit  int default 100,
  p_offset int default 0
)
returns table (
  id uuid,
  occurs_on date,
  student_id uuid,
  student text,
  matricule text,
  class_id uuid,
  class_name text,
  subject text,
  status text,
  minutes_late int,
  comment text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_all boolean;
begin
  if not (app.can_read(p_school, 'attendance.view') or app.can_read(p_school, 'attendance.view_all')) then
    raise exception 'Droit requis : consulter les présences.' using errcode = '42501';
  end if;
  v_all := app.is_platform_admin()
        or p_school in (select app.my_schools_with('attendance.view_all'))
        or p_school in (select app.my_schools_with('schedule.view_all'));

  return query
  with q as (
    select nullif(btrim(coalesce(p_q, '')), '') as text
  ),
  rows as (
    select ar.id, o.occurs_on, s.id as student_id,
           upper(s.last_name) || ' ' || s.first_name as student,
           s.last_name, s.first_name, s.matricule,
           c.id as class_id, c.name as class_name, coalesce(l.sequence, 999) as level_seq,
           coalesce(sj.name, 'Cours') as subject,
           ar.status::text as status, ar.minutes_late, ar.comment
    from attendance_records ar
    join attendance_registers r on r.id = ar.register_id
    join session_occurrences o on o.id = r.session_occurrence_id
    join students s on s.id = ar.student_id
    left join academic_years y
      on y.school_id = p_school and o.occurs_on between y.starts_on and y.ends_on
    left join student_enrollments e
      on e.student_id = s.id and e.academic_year_id = y.id
    left join classes c on c.id = e.class_id
    left join levels l on l.id = c.level_id
    left join schedule_sessions ss on ss.id = o.schedule_session_id
    left join subjects sj on sj.id = ss.subject_id
    cross join q
    where ar.school_id = p_school
      and (v_all or o.schedule_session_id in (select app.my_visible_sessions()))
      and ar.status in ('ABSENT', 'LATE')
      and o.occurs_on between p_from and p_to
      and (p_kind is null or ar.status::text = p_kind)
      and (p_level is null or c.level_id = p_level)
      and (p_class is null or c.id = p_class)
      and (q.text is null
           or s.last_name ilike '%' || q.text || '%'
           or s.first_name ilike '%' || q.text || '%'
           or s.matricule ilike '%' || q.text || '%'
           or (s.last_name || ' ' || s.first_name) ilike '%' || q.text || '%')
  )
  select rows.id, rows.occurs_on, rows.student_id, rows.student, rows.matricule, rows.class_id, rows.class_name,
         rows.subject, rows.status, rows.minutes_late, rows.comment, count(*) over ()
  from rows
  order by
    case when p_sort = 'classe' then rows.level_seq end,
    case when p_sort = 'classe' then rows.class_name end,
    case when p_sort = 'eleve' then rows.last_name end,
    case when p_sort = 'eleve' then rows.first_name end,
    rows.occurs_on desc, rows.last_name, rows.first_name, rows.id
  limit greatest(1, least(p_limit, 500))
  offset greatest(0, p_offset);
end;
$$;
revoke all on function public.absences_page(uuid, date, date, uuid, uuid, text, text, text, int, int) from public, anon;
grant execute on function public.absences_page(uuid, date, date, uuid, uuid, text, text, text, int, int) to authenticated;
