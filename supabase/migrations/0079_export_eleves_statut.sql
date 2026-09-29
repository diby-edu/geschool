-- =============================================================================
-- 0079 — L'export des élèves porte le statut et le redoublement
-- =============================================================================
--
-- Deux colonnes que l'inscription exige desormais (0078) doivent suivre dans
-- l'export : une liste officielle sans le statut d'affectation ne sert a rien,
-- et le redoublement se lit sur l'inscription, pas sur la fiche eleve.
--
-- La fonction est remplacee : son type de retour change, donc `create or
-- replace` seul ne suffit pas.

drop function if exists public.export_students(uuid, uuid, text[], uuid, integer);

create or replace function public.export_students(
  p_school uuid,
  p_year uuid,
  p_terms text[] default '{}'::text[],
  p_after uuid default null::uuid,
  p_limit integer default 1000
)
returns table(
  enrollment_id uuid,
  matricule text,
  last_name text,
  first_name text,
  gender text,
  birth_date date,
  birth_place text,
  class_name text,
  is_state_assigned boolean,
  is_repeating boolean,
  guardian_last_name text,
  guardian_first_name text,
  guardian_relation text,
  guardian_phone text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not app.can_read(p_school, 'students.export') then
    raise exception 'Droit requis : exporter les eleves.' using errcode = '42501';
  end if;

  return query
  select
    e.id,
    s.matricule,
    s.last_name,
    s.first_name,
    s.gender::text,
    s.birth_date,
    s.birth_place,
    c.name,
    s.is_state_assigned,
    e.is_repeating,
    g.last_name,
    g.first_name,
    sg.relationship::text,
    g.phone_e164
  from public.student_enrollments e
  join public.students s on s.id = e.student_id and s.deleted_at is null
  left join public.classes c on c.id = e.class_id
  left join lateral (
    select x.guardian_id, x.relationship
    from public.student_guardians x
    where x.student_id = s.id
    order by x.is_primary_contact desc, x.created_at
    limit 1
  ) sg on true
  left join public.guardians g on g.id = sg.guardian_id
  where e.school_id = p_school
    and e.academic_year_id = p_year
    and e.status = 'ENROLLED'
    and (p_after is null or e.id > p_after)
    and not exists (
      select 1
      from unnest(coalesce(p_terms, '{}')) as t(term)
      where strpos(lower(s.last_name), lower(t.term)) = 0
        and strpos(lower(s.first_name), lower(t.term)) = 0
        and strpos(lower(s.matricule), lower(t.term)) = 0
    )
  order by e.id
  limit greatest(1, least(coalesce(p_limit, 1000), 1000));
end;
$function$;

grant execute on function public.export_students(uuid, uuid, text[], uuid, integer) to authenticated, service_role;
