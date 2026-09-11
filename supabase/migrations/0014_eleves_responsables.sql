-- =============================================================================
-- 0014 — Eleves, responsables legaux, inscriptions, appartenance aux groupes
-- =============================================================================

create type student_status       as enum ('ACTIVE', 'TRANSFERRED', 'GRADUATED', 'DROPPED', 'SUSPENDED', 'ARCHIVED');
create type enrollment_status    as enum ('ENROLLED', 'TRANSFERRED_OUT', 'WITHDRAWN', 'COMPLETED');
create type guardian_relationship as enum ('FATHER', 'MOTHER', 'TUTOR', 'LEGAL_GUARDIAN', 'SIBLING', 'OTHER');
create type guardian_status      as enum ('ACTIVE', 'INACTIVE');

-- -----------------------------------------------------------------------------
-- students
-- -----------------------------------------------------------------------------

create table students (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  -- NULL tant que le compte n'existe pas (inscription hors ligne non encore
  -- synchronisee, par exemple). L'interface ne doit jamais pretendre le
  -- contraire (docs/OFFLINE_SYNC.md §7).
  user_id       uuid references users(id) on delete set null,

  -- Attribue par le serveur, jamais par l'appareil : deux agents hors ligne ne
  -- doivent pas pouvoir produire le meme numero.
  matricule     text not null,

  first_name    text not null,
  last_name     text not null,
  middle_names  text,
  gender        gender,
  birth_date    date,
  birth_place   text,
  nationality   text,

  photo_url     text,
  address       text,
  phone_e164    text,
  email         text,

  status        student_status not null default 'ACTIVE',
  notes         text,
  -- Separe des notes generales : sa lecture exige students.view_sensitive
  medical_notes text,

  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references users(id) on delete set null,

  unique (school_id, matricule),
  constraint students_phone_e164 check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);

create index students_school_idx on students (school_id, status, last_name)
  where deleted_at is null;
create unique index students_user_key on students (school_id, user_id)
  where user_id is not null;

create trigger students_touch before update on students
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- student_enrollments — la classe d'un eleve est PAR ANNEE
--
-- Jamais une colonne class_id sur students : un eleve change de classe chaque
-- annee, et l'historique doit rester consultable.
-- -----------------------------------------------------------------------------

create table student_enrollments (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  class_id         uuid not null references classes(id) on delete restrict,

  enrolled_on      date not null default current_date,
  is_repeating     boolean not null default false,
  status           enrollment_status not null default 'ENROLLED',
  left_on          date,
  left_reason      text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (student_id, academic_year_id)
);

create index student_enrollments_class_idx
  on student_enrollments (school_id, academic_year_id, class_id, status);
create index student_enrollments_student_idx on student_enrollments (student_id);

create trigger student_enrollments_touch before update on student_enrollments
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- guardians
--
-- L'unicite (school_id, phone_e164) est la cle du « rechercher ou creer » de
-- l'additif comptes §4 : un pere de trois enfants n'a qu'un seul compte.
-- Sans elle, chaque inscription creerait un doublon.
-- -----------------------------------------------------------------------------

create table guardians (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references schools(id) on delete cascade,
  user_id              uuid references users(id) on delete set null,

  first_name           text not null,
  last_name            text not null,
  gender               gender,

  -- Identifiant de connexion du parent (ADR-005). Toujours stocke en E.164.
  phone_e164           text not null,
  -- Forme lisible selon le pays, pour l'affichage uniquement
  phone_display        text,
  secondary_phone_e164 text,

  email                text,
  address              text,
  profession           text,
  status               guardian_status not null default 'ACTIVE',

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references users(id) on delete set null,

  unique (school_id, phone_e164),
  constraint guardians_phone_e164 check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  constraint guardians_secondary_phone_e164 check (
    secondary_phone_e164 is null or secondary_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'
  )
);

create index guardians_school_idx on guardians (school_id, last_name);
create unique index guardians_user_key on guardians (school_id, user_id)
  where user_id is not null;

create trigger guardians_touch before update on guardians
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- student_guardians
--
-- C'est CETTE table, et elle seule, qui definit le perimetre d'un parent.
-- Un pere lie a Jean, Marie et Paul les voit tous trois ; une mere liee a Jean
-- et Marie ne voit pas Paul, meme si l'autre parent y est lie.
-- -----------------------------------------------------------------------------

create table student_guardians (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references schools(id) on delete cascade,
  student_id            uuid not null references students(id) on delete cascade,
  guardian_id           uuid not null references guardians(id) on delete cascade,

  relationship          guardian_relationship not null,
  is_legal_guardian     boolean not null default true,
  is_primary_contact    boolean not null default false,
  can_pick_up           boolean not null default true,
  receives_notifications boolean not null default true,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (student_id, guardian_id)
);

create index student_guardians_guardian_idx on student_guardians (guardian_id);
create index student_guardians_student_idx on student_guardians (student_id);
create index student_guardians_school_idx on student_guardians (school_id);

-- Un seul contact principal par eleve
create unique index student_guardians_primary_key
  on student_guardians (student_id) where is_primary_contact;

create trigger student_guardians_touch before update on student_guardians
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- student_groups
-- -----------------------------------------------------------------------------

create table student_groups (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  group_id         uuid not null references groups(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  joined_at        date not null default current_date,
  left_at          date,
  created_at       timestamptz not null default now(),

  unique (student_id, group_id, academic_year_id)
);

create index student_groups_group_idx on student_groups (group_id, academic_year_id);
create index student_groups_student_idx on student_groups (student_id);
create index student_groups_school_idx on student_groups (school_id);

-- -----------------------------------------------------------------------------
-- Perimetres derives — parent et eleve
--
-- Appliques en RLS, jamais par un filtre cote client (additif comptes §2).
-- -----------------------------------------------------------------------------

create or replace function app.is_guardian_of(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student
      and g.user_id = auth.uid()
      and g.status = 'ACTIVE'
  );
$$;

create or replace function app.is_self_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.students s
    where s.id = p_student
      and s.user_id = auth.uid()
      and s.deleted_at is null
  );
$$;

-- Les eleves dont je suis responsable, ou que je suis moi-meme.
create or replace function app.my_student_ids(p_school uuid)
returns uuid[]
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select coalesce(array_agg(distinct sid), '{}'::uuid[])
  from (
    select sg.student_id as sid
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where g.user_id = auth.uid() and g.status = 'ACTIVE' and sg.school_id = p_school
    union
    select s.id
    from public.students s
    where s.user_id = auth.uid() and s.school_id = p_school and s.deleted_at is null
  ) t;
$$;

-- -----------------------------------------------------------------------------
-- app.can_see_student — point d'entree unique de la visibilite d'un eleve
--
-- Definie ici avec les branches disponibles (plateforme, permission, parent,
-- soi-meme). La migration 0015 la REMPLACE pour y ajouter la branche
-- enseignant, une fois teaching_assignments cree. `create or replace`
-- conserve l'OID de la fonction : les policies qui l'appellent restent
-- valides et prennent le nouveau corps sans etre recreees.
-- -----------------------------------------------------------------------------

create or replace function app.can_see_student(p_school uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select app.is_platform_admin()
      or (app.is_member_of(p_school) and app.has_permission(p_school, 'students.view'))
      or app.is_guardian_of(p_student)
      or app.is_self_student(p_student);
$$;

grant execute on function
  app.is_guardian_of(uuid),
  app.is_self_student(uuid),
  app.my_student_ids(uuid),
  app.can_see_student(uuid, uuid)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table students enable row level security;
alter table students force  row level security;

create policy students_select on students for select to authenticated
using (app.can_see_student(school_id, id));

create policy students_insert on students for insert to authenticated
with check (app.can_write(school_id, 'students.create'));

create policy students_update on students for update to authenticated
using (app.can_write(school_id, 'students.update'))
with check (app.can_write(school_id, 'students.update'));

create policy students_delete on students for delete to authenticated
using (app.can_write(school_id, 'students.delete'));

alter table student_enrollments enable row level security;
alter table student_enrollments force  row level security;

create policy enrollments_select on student_enrollments for select to authenticated
using (app.can_see_student(school_id, student_id));

create policy enrollments_insert on student_enrollments for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'enrollments.create'));

create policy enrollments_update on student_enrollments for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'enrollments.validate'))
with check (app.can_write_year(school_id, academic_year_id, 'enrollments.validate'));

create policy enrollments_delete on student_enrollments for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'enrollments.withdraw'));

alter table guardians enable row level security;
alter table guardians force  row level security;

-- Un parent se voit lui-meme. Il ne voit PAS les autres responsables d'un
-- meme eleve : leurs coordonnees ne le regardent pas.
create policy guardians_select on guardians for select to authenticated
using (
  user_id = auth.uid()
  or app.can_read(school_id, 'guardians.view')
);

create policy guardians_insert on guardians for insert to authenticated
with check (app.can_write(school_id, 'guardians.create'));

create policy guardians_update on guardians for update to authenticated
using (user_id = auth.uid() or app.can_write(school_id, 'guardians.update'))
with check (user_id = auth.uid() or app.can_write(school_id, 'guardians.update'));

create policy guardians_delete on guardians for delete to authenticated
using (app.can_write(school_id, 'guardians.delete'));

alter table student_guardians enable row level security;
alter table student_guardians force  row level security;

create policy student_guardians_select on student_guardians for select to authenticated
using (
  app.can_read(school_id, 'guardians.view')
  or app.is_guardian_of(student_id)
  or app.is_self_student(student_id)
);

create policy student_guardians_insert on student_guardians for insert to authenticated
with check (app.can_write(school_id, 'guardians.create'));

create policy student_guardians_update on student_guardians for update to authenticated
using (app.can_write(school_id, 'guardians.update'))
with check (app.can_write(school_id, 'guardians.update'));

create policy student_guardians_delete on student_guardians for delete to authenticated
using (app.can_write(school_id, 'guardians.delete'));

alter table student_groups enable row level security;
alter table student_groups force  row level security;

create policy student_groups_select on student_groups for select to authenticated
using (app.can_see_student(school_id, student_id));

create policy student_groups_insert on student_groups for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'groups.assign_students'));

create policy student_groups_update on student_groups for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'groups.assign_students'))
with check (app.can_write_year(school_id, academic_year_id, 'groups.assign_students'));

create policy student_groups_delete on student_groups for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'groups.assign_students'));

grant select, insert, update, delete on
  students, student_enrollments, guardians, student_guardians, student_groups
to authenticated;
