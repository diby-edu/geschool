-- =============================================================================
-- 0144 — Exporter toutes les données d'une école (Super Admin, fiche école)
-- =============================================================================
-- Décidé le 2026-10-25 (lot 3) : un ZIP de tableaux (CSV, séparateur « ; »),
-- un par sujet, pour une école qui part ou une sauvegarde. Pas de suppression
-- définitive : on archive (les notes et bulletins ont une valeur légale).
--
-- Lire 542 000 notes 1 000 par 1 000 depuis l'application prendrait des
-- minutes : la base rend ici des PAQUETS de lignes déjà mises en forme
-- (une seule valeur texte par appel, donc sans le plafond des 1 000 lignes),
-- dans l'ordre de l'identifiant, pour reprendre où le paquet précédent s'arrête.
-- Réservé à l'administration de la plateforme.
-- =============================================================================

-- Reprendre « après tel identifiant » DANS une école : sans ces index, la base
-- parcourait les notes de TOUTE la plateforme dans l'ordre (9 s par paquet).
create index if not exists grades_school_id_key_idx on public.grades (school_id, id);
create index if not exists attendance_records_school_id_key_idx on public.attendance_records (school_id, id);

create or replace function app.csv_cell(v text)
returns text
language sql
immutable
as $$
  select case
           when v is null then ''
           when v ~ '[;"\r\n]' then '"' || replace(v, '"', '""') || '"'
           else v
         end;
$$;

create or replace function app.csv_date(d date)
returns text
language sql
immutable
as $$
  select case when d is null then '' else to_char(d, 'DD/MM/YYYY') end;
$$;

-- 14.500 → « 14,5 » : la virgule d'Excel en français, sans zéros inutiles.
create or replace function app.csv_num(v numeric)
returns text
language sql
immutable
as $$
  select case when v is null then '' else replace(rtrim(rtrim(v::text, '0'), '.'), '.', ',') end;
$$;

create or replace function public.platform_export_chunk(p_school uuid, p_kind text, p_after uuid, p_limit integer default 20000)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_csv text;
  v_last uuid;
  v_n integer;
  v_lim integer := greatest(1, least(coalesce(p_limit, 20000), 50000));
  v_after uuid := coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid);
begin
  if not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme.' using errcode = '42501';
  end if;

  if p_kind = 'eleves' then
    with r as (
      select s.id,
             concat_ws(';', csv_cell(s.matricule), csv_cell(upper(s.last_name)), csv_cell(s.first_name), csv_cell(s.gender::text),
               csv_date(s.birth_date), csv_cell(s.birth_place), csv_cell(s.nationality), csv_cell(s.status::text),
               csv_cell((select c.name from student_enrollments e join classes c on c.id = e.class_id
                          where e.student_id = s.id and e.status = 'ENROLLED' order by e.created_at desc limit 1))) as l
      from students s where s.school_id = p_school and s.deleted_at is null and s.id > v_after order by s.id limit v_lim
    ) select string_agg(l, E'\n' order by id), max(id::text)::uuid, count(*) into v_csv, v_last, v_n from r;

  elsif p_kind = 'parents' then
    with r as (
      select g.id,
             concat_ws(';', csv_cell(upper(g.last_name)), csv_cell(g.first_name), csv_cell(g.phone_e164), csv_cell(g.secondary_phone_e164),
               csv_cell(g.email), csv_cell(g.profession), csv_cell(g.status::text),
               csv_cell((select string_agg(st.matricule, ', ' order by st.matricule) from student_guardians sg join students st on st.id = sg.student_id
                          where sg.guardian_id = g.id))) as l
      from guardians g where g.school_id = p_school and g.id > v_after order by g.id limit v_lim
    ) select string_agg(l, E'\n' order by id), max(id::text)::uuid, count(*) into v_csv, v_last, v_n from r;

  elsif p_kind = 'enseignants' then
    with r as (
      select t.id,
             concat_ws(';', csv_cell(t.staff_number), csv_cell(upper(t.last_name)), csv_cell(t.first_name), csv_cell(t.gender::text),
               csv_cell(t.phone_e164), csv_cell(t.email), csv_cell(t.specialty), csv_cell(t.employment_type::text),
               csv_cell(t.status::text), csv_date(t.hire_date)) as l
      from teachers t where t.school_id = p_school and t.deleted_at is null and t.id > v_after order by t.id limit v_lim
    ) select string_agg(l, E'\n' order by id), max(id::text)::uuid, count(*) into v_csv, v_last, v_n from r;

  elsif p_kind = 'personnel' then
    with r as (
      select p.id,
             concat_ws(';', csv_cell(p.staff_number), csv_cell(upper(p.last_name)), csv_cell(p.first_name), csv_cell(p.phone_e164),
               csv_cell(p.email), csv_cell(p.employment_type::text),
               csv_cell((select string_agg(distinct ro.name, ', ') from school_memberships m join membership_roles mr on mr.membership_id = m.id
                          join roles ro on ro.id = mr.role_id where m.school_id = p_school and m.user_id = p.user_id))) as l
      from staff_profiles p where p.school_id = p_school and p.id > v_after order by p.id limit v_lim
    ) select string_agg(l, E'\n' order by id), max(id::text)::uuid, count(*) into v_csv, v_last, v_n from r;

  elsif p_kind = 'classes' then
    with r as (
      select c.id,
             concat_ws(';', csv_cell(c.name), csv_cell(lv.name), csv_cell(c.capacity::text), csv_cell(y.name),
               csv_cell(case when ht.id is not null then upper(ht.last_name) || ' ' || ht.first_name end),
               csv_cell((select count(*)::text from student_enrollments e where e.class_id = c.id and e.status = 'ENROLLED'))) as l
      from classes c left join levels lv on lv.id = c.level_id left join academic_years y on y.id = c.academic_year_id
      left join teachers ht on ht.id = c.head_teacher_id
      where c.school_id = p_school and c.id > v_after order by c.id limit v_lim
    ) select string_agg(l, E'\n' order by id), max(id::text)::uuid, count(*) into v_csv, v_last, v_n from r;

  elsif p_kind = 'matieres' then
    with r as (
      select sj.id, concat_ws(';', csv_cell(sj.code), csv_cell(sj.name), csv_cell(sj.short_name), csv_num(sj.default_coefficient),
               csv_cell(case when sj.is_active then 'oui' else 'non' end)) as l
      from subjects sj where sj.school_id = p_school and sj.id > v_after order by sj.id limit v_lim
    ) select string_agg(l, E'\n' order by id), max(id::text)::uuid, count(*) into v_csv, v_last, v_n from r;

  elsif p_kind = 'evaluations' then
    with r as (
      select a.id,
             concat_ws(';', csv_date(a.assessment_date), csv_cell(a.title), csv_cell(sj.name), csv_cell(c.name), csv_cell(ap.name),
               csv_num(a.max_score), csv_num(a.coefficient), csv_cell(a.status::text)) as l
      from assessments a left join subjects sj on sj.id = a.subject_id left join classes c on c.id = a.class_id
      left join academic_periods ap on ap.id = a.academic_period_id
      where a.school_id = p_school and a.id > v_after order by a.id limit v_lim
    ) select string_agg(l, E'\n' order by id), max(id::text)::uuid, count(*) into v_csv, v_last, v_n from r;

  elsif p_kind = 'notes' then
    with r as (
      select g.id,
             concat_ws(';', csv_cell(st.matricule), csv_cell(upper(st.last_name) || ' ' || st.first_name), csv_date(a.assessment_date),
               csv_cell(a.title), csv_cell(sj.name), csv_cell(c.name), csv_cell(ap.name),
               case when g.is_absent then 'absent' else csv_num(g.score) end, csv_num(a.max_score), csv_num(a.coefficient)) as l
      from grades g join assessments a on a.id = g.assessment_id join students st on st.id = g.student_id
      left join subjects sj on sj.id = a.subject_id left join classes c on c.id = a.class_id
      left join academic_periods ap on ap.id = a.academic_period_id
      where g.school_id = p_school and g.id > v_after order by g.id limit v_lim
    ) select string_agg(l, E'\n' order by id), max(id::text)::uuid, count(*) into v_csv, v_last, v_n from r;

  elsif p_kind = 'absences' then
    with r as (
      select ar.id,
             concat_ws(';', csv_date(o.occurs_on), csv_cell(st.matricule), csv_cell(upper(st.last_name) || ' ' || st.first_name),
               csv_cell(case ar.status::text when 'ABSENT' then 'Absent' when 'EXCUSED' then 'Excusé' when 'LATE' then 'Retard' else ar.status::text end),
               csv_cell(ar.minutes_late::text), csv_cell(sj.name), csv_cell(ar.comment)) as l
      from attendance_records ar join attendance_registers rg on rg.id = ar.register_id
      join session_occurrences o on o.id = rg.session_occurrence_id join students st on st.id = ar.student_id
      left join schedule_sessions ss on ss.id = o.schedule_session_id left join subjects sj on sj.id = ss.subject_id
      where ar.school_id = p_school and ar.status <> 'PRESENT' and ar.id > v_after order by ar.id limit v_lim
    ) select string_agg(l, E'\n' order by id), max(id::text)::uuid, count(*) into v_csv, v_last, v_n from r;

  elsif p_kind = 'bulletins' then
    with r as (
      select rc.id,
             concat_ws(';', csv_cell(st.matricule), csv_cell(upper(st.last_name) || ' ' || st.first_name), csv_cell(c.name), csv_cell(ap.name),
               csv_num(rc.general_average), csv_cell(rc.rank::text), csv_cell(rc.class_size::text),
               csv_cell(coalesce(rc.decision_label, rc.decision::text)), csv_cell(rc.status::text)) as l
      from report_cards rc join students st on st.id = rc.student_id left join classes c on c.id = rc.class_id
      left join academic_periods ap on ap.id = rc.academic_period_id
      where rc.school_id = p_school and rc.id > v_after order by rc.id limit v_lim
    ) select string_agg(l, E'\n' order by id), max(id::text)::uuid, count(*) into v_csv, v_last, v_n from r;

  else
    raise exception 'Liste inconnue : %', p_kind using errcode = '22023';
  end if;

  return jsonb_build_object('csv', coalesce(v_csv, ''), 'last', v_last, 'n', coalesce(v_n, 0));
end;
$$;

revoke all on function public.platform_export_chunk(uuid, text, uuid, integer) from public, anon;
grant execute on function public.platform_export_chunk(uuid, text, uuid, integer) to authenticated, service_role;
