-- =============================================================================
-- 0164 — Classes dans l'ordre naturel : « 6ème 2 » avant « 6ème 10 »
-- =============================================================================
-- Constaté en ligne le 2026-10-31 : la liste des élèves triée par classe donnait
-- 6ème 1, puis 6ème 10, puis 6ème 2 — la base comparait les noms comme du texte.
-- Une collation « naturelle » (les nombres comparés comme des nombres) corrige
-- le tri par classe des élèves (0161) et des absences (0163). Le reste des deux
-- fonctions est inchangé.
-- =============================================================================

create collation if not exists public.naturel (provider = icu, locale = 'und-u-kn-true');

create or replace function public.students_page(
  p_school    uuid,
  p_year      uuid,
  p_level     uuid default null,
  p_class     uuid default null,
  p_assigned  text default null,   -- 'affecte' | 'non-affecte' | 'inconnu'
  p_situation text default null,   -- 'redoublant' | 'nouveau'
  p_q         text default null,
  p_sort      text default 'classe', -- 'classe' | 'nom' | 'matricule'
  p_desc      boolean default false,
  p_limit     int default 50,
  p_offset    int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start date;
  v_q     text := nullif(btrim(coalesce(p_q, '')), '');
  v       jsonb;
begin
  if not app.can_read(p_school, 'students.view') then
    raise exception 'Droit requis : consulter les élèves.' using errcode = '42501';
  end if;
  select starts_on into v_start from academic_years where id = p_year and school_id = p_school;
  -- Jokers de la saisie neutralisés : « 50% » cherche « 50% », pas tout.
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  with base as (
    select s.id, s.matricule, s.first_name, s.last_name, s.gender, s.is_state_assigned,
           e.is_repeating, c.id as class_id, c.name as class_name, l.id as level_id, l.name as level_name,
           coalesce(l.sequence, 999) as level_seq
    from student_enrollments e
    join students s on s.id = e.student_id and s.school_id = p_school and s.deleted_at is null
    left join classes c on c.id = e.class_id
    left join levels l on l.id = c.level_id
    where e.school_id = p_school
      and e.academic_year_id = p_year
      and e.status = 'ENROLLED'
      and (p_level is null or l.id = p_level)
      and (p_class is null or c.id = p_class)
      and (p_assigned is null
           or (p_assigned = 'affecte' and s.is_state_assigned is true)
           or (p_assigned = 'non-affecte' and s.is_state_assigned is false)
           or (p_assigned = 'inconnu' and s.is_state_assigned is null))
      and (v_q is null
           or s.last_name ilike '%' || v_q || '%'
           or s.first_name ilike '%' || v_q || '%'
           or s.matricule ilike '%' || v_q || '%'
           or (s.last_name || ' ' || s.first_name) ilike '%' || v_q || '%')
  ),
  -- « Nouveau » : aucune inscription dans l'école une année précédente.
  filt as (
    select b.*,
           not exists (
             select 1 from student_enrollments p
             join academic_years y on y.id = p.academic_year_id
             where p.student_id = b.id and p.academic_year_id <> p_year and y.starts_on < v_start
           ) as is_new
    from base b
  ),
  kept as (
    select * from filt
    where p_situation is null
       or (p_situation = 'redoublant' and is_repeating)
       or (p_situation = 'nouveau' and is_new)
  ),
  -- Rang de chaque élève dans l'ordre demandé : par classe (niveau, puis nom de
  -- classe en ordre naturel : « 6ème 2 » avant « 6ème 10 »), par nom ou par matricule.
  ordered as (
    select k.*,
           row_number() over (
             order by
               case when p_sort = 'nom' and not p_desc then lower(k.last_name || ' ' || k.first_name) end asc,
               case when p_sort = 'nom' and p_desc then lower(k.last_name || ' ' || k.first_name) end desc,
               case when p_sort = 'matricule' and not p_desc then k.matricule end collate public.naturel asc,
               case when p_sort = 'matricule' and p_desc then k.matricule end collate public.naturel desc,
               case when p_sort not in ('nom', 'matricule') and not p_desc then k.level_seq end asc,
               case when p_sort not in ('nom', 'matricule') and p_desc then k.level_seq end desc,
               case when p_sort not in ('nom', 'matricule') and not p_desc then k.class_name end collate public.naturel asc nulls last,
               case when p_sort not in ('nom', 'matricule') and p_desc then k.class_name end collate public.naturel desc nulls last,
               k.last_name, k.first_name, k.id
           ) as rank
    from kept k
  ),
  page as (
    select * from ordered
    order by rank
    limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)
  )
  select jsonb_build_object(
    'total', (select count(*) from kept),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'matricule', p.matricule,
               'first_name', p.first_name,
               'last_name', p.last_name,
               'gender', p.gender,
               'is_state_assigned', p.is_state_assigned,
               'is_repeating', p.is_repeating,
               'is_new', p.is_new,
               'class_id', p.class_id,
               'class_name', p.class_name,
               'level_id', p.level_id,
               'level_name', p.level_name,
               'level_seq', p.level_seq,
               'guardian_phone', (
                 select coalesce(g.phone_display, g.phone_e164)
                 from student_guardians sg join guardians g on g.id = sg.guardian_id
                 where sg.student_id = p.id and sg.school_id = p_school
                   and coalesce(g.phone_display, g.phone_e164) is not null
                 order by sg.is_primary_contact desc
                 limit 1)
             ) order by p.rank)
      from page p), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function public.students_page(uuid, uuid, uuid, uuid, text, text, text, text, boolean, int, int) from public, anon;
grant execute on function public.students_page(uuid, uuid, uuid, uuid, text, text, text, text, boolean, int, int) to authenticated;

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
    case when p_sort = 'classe' then rows.class_name end collate public.naturel,
    case when p_sort = 'eleve' then rows.last_name end,
    case when p_sort = 'eleve' then rows.first_name end,
    rows.occurs_on desc, rows.last_name, rows.first_name, rows.id
  limit greatest(1, least(p_limit, 500))
  offset greatest(0, p_offset);
end;
$$;
revoke all on function public.absences_page(uuid, date, date, uuid, uuid, text, text, text, int, int) from public, anon;
grant execute on function public.absences_page(uuid, date, date, uuid, uuid, text, text, text, int, int) to authenticated;
