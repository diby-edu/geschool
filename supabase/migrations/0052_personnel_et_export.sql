-- 0052 — Personnel administratif et export des eleves
--
-- 1. `staff_profiles` : le dossier du PERSONNEL ADMINISTRATIF (directeur, censeur,
--    secretaire, informaticien...). Les enseignants ont leur propre table
--    (`teachers`) et ne passent pas par ici. Les fonctions (roles) ne sont pas
--    stockees ici : elles restent dans `membership_roles`, une seule source.
--    Le fondateur n'a pas de dossier tant qu'il n'en remplit pas un.
-- 2. `public.export_students` : lecture en bloc des eleves inscrits pour l'export,
--    protegee par le droit `students.export` verifie UNE fois. Lue sous RLS, la
--    meme requete evalue les regles ligne par ligne : 5 s pour 800 eleves contre
--    0,4 s ici (mesure) — soit environ 35 s pour 5 600 eleves, au-dela de ce qu'un
--    telechargement supporte. Le droit `students.export` devient ainsi applique
--    aussi en base.
--
-- Numero 0052 : le 0051 est reserve a la correction des droits des enseignants
-- (session separee, pas encore appliquee).

-- -----------------------------------------------------------------------------
-- 1. Dossier du personnel administratif
-- -----------------------------------------------------------------------------

create table staff_profiles (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  -- Matricule ; null = « en cours » (pas encore attribue).
  staff_number    text,
  first_name      text not null,
  last_name       text not null,
  gender          gender,
  birth_date      date,
  birth_place     text,
  -- Telephone principal : identifiant de connexion de la personne.
  phone_e164      text,
  phone2_e164     text,
  email           text,
  diploma         text,
  diploma_detail  text,
  hire_date       date,
  employment_type employment_type not null default 'PERMANENT',
  notes           text,
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint staff_profiles_one_per_school unique (school_id, user_id),
  constraint staff_profiles_names_not_blank check (btrim(first_name) <> '' and btrim(last_name) <> '')
);

create unique index staff_profiles_number_key on staff_profiles (school_id, staff_number)
  where staff_number is not null;
create index staff_profiles_school_idx on staff_profiles (school_id);

create trigger staff_profiles_touch before update on staff_profiles
  for each row execute function app.touch_updated_at();

-- Le dossier doit concerner un MEMBRE de l'etablissement : sans cela, un
-- utilisateur ayant `users.create` pourrait rattacher un dossier a n'importe quel
-- compte de la plateforme.
create or replace function app.guard_staff_profile_member()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.school_memberships m where m.school_id = new.school_id and m.user_id = new.user_id
  ) then
    raise exception 'Cette personne n''appartient pas a l''etablissement.' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger staff_profiles_member_guard before insert on staff_profiles
  for each row execute function app.guard_staff_profile_member();

alter table staff_profiles enable row level security;
alter table staff_profiles force  row level security;

create policy staff_profiles_select on staff_profiles for select to authenticated
using (user_id = auth.uid() or app.can_read(school_id, 'users.view'));

create policy staff_profiles_insert on staff_profiles for insert to authenticated
with check (app.can_write(school_id, 'users.create'));

create policy staff_profiles_update on staff_profiles for update to authenticated
using (app.can_write(school_id, 'users.update'))
with check (app.can_write(school_id, 'users.update'));

create policy staff_profiles_delete on staff_profiles for delete to authenticated
using (app.is_platform_admin());

-- Mise a jour en direct (comme les autres tables suivies, voir 0048 / 0049).
alter publication supabase_realtime add table public.staff_profiles;
create trigger live_notify_delete after delete on staff_profiles
  referencing old table as changed for each statement execute function app.live_notify_delete();

-- -----------------------------------------------------------------------------
-- 2. Export des eleves
-- -----------------------------------------------------------------------------

-- Une page (curseur sur l'identifiant de l'inscription, jamais par decalage), dans
-- l'ordre de l'identifiant : le plafond de lignes de l'API est de 1000 par appel.
-- `p_terms` : mots de la recherche (chacun doit se retrouver dans le nom, le prenom
-- ou le matricule), compares sans jokers.
create or replace function public.export_students(
  p_school uuid,
  p_year   uuid,
  p_terms  text[] default '{}',
  p_after  uuid   default null,
  p_limit  integer default 1000
)
returns table (
  enrollment_id      uuid,
  matricule          text,
  last_name          text,
  first_name         text,
  gender             text,
  birth_date         date,
  birth_place        text,
  class_name         text,
  guardian_last_name text,
  guardian_first_name text,
  guardian_relation  text,
  guardian_phone     text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
  limit least(greatest(p_limit, 1), 1000);
end;
$$;
revoke all on function public.export_students(uuid, uuid, text[], uuid, integer) from public, anon;
grant execute on function public.export_students(uuid, uuid, text[], uuid, integer) to authenticated;
