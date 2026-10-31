-- =============================================================================
-- 0161 — Liste des élèves : filtrée et triée par la base, en une lecture
-- =============================================================================
-- Maquette « listes et présences », validée le 2026-10-30. La liste des élèves
-- ne savait ni filtrer par niveau, ni trier par classe, et son tri n'était
-- appliqué qu'à l'intérieur de chaque page (les pages arrivaient dans un ordre
-- quelconque). Ici, une seule lecture : filtres (niveau, classe, affectation,
-- redoublant / nouveau, recherche), tri (classe — par niveau puis classe —,
-- nom ou matricule), page demandée, et pour les seules lignes de la page le
-- sexe, la situation et le téléphone du parent à contacter.
-- =============================================================================

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
  ordered as (
    select k.*,
           case p_sort
             when 'nom' then lower(k.last_name || ' ' || k.first_name)
             when 'matricule' then k.matricule
             else lpad(k.level_seq::text, 4, '0') || '|' || coalesce(k.class_name, '~')
           end as sort_key
    from kept k
  ),
  page as (
    select * from ordered
    order by case when not p_desc then sort_key end asc nulls last,
             case when p_desc then sort_key end desc nulls last,
             last_name, first_name, id
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
             ) order by
               case when not p_desc then p.sort_key end asc nulls last,
               case when p_desc then p.sort_key end desc nulls last,
               p.last_name, p.first_name, p.id)
      from page p), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function public.students_page(uuid, uuid, uuid, uuid, text, text, text, text, boolean, int, int) from public, anon;
grant execute on function public.students_page(uuid, uuid, uuid, uuid, text, text, text, text, boolean, int, int) to authenticated;
