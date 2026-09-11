-- =============================================================================
-- 0011 — Enseignants, qualifications, disponibilites
-- =============================================================================
--
-- Un enseignant appartient a UN SEUL etablissement pour sa planification (§73).
-- Le compte utilisateur, lui, peut exister ailleurs : c'est le profil enseignant
-- qui est tenant, pas la personne.

create type employment_type as enum ('PERMANENT', 'CONTRACT', 'HOURLY', 'INTERN', 'OTHER');
create type teacher_status  as enum ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'LEFT');

create table teachers (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(id) on delete cascade,
  -- NULL tant que le compte n'est pas cree
  user_id            uuid references users(id) on delete set null,

  staff_number       text not null,
  first_name         text not null,
  last_name          text not null,
  gender             gender,
  birth_date         date,
  phone_e164         text,
  email              text,
  address            text,
  photo_url          text,

  hire_date          date,
  employment_type    employment_type not null default 'PERMANENT',
  specialty          text,
  status             teacher_status not null default 'ACTIVE',

  -- Bornes de charge hebdomadaire, en minutes. Exploitees comme contraintes
  -- par le moteur d'emploi du temps.
  weekly_minutes_min integer,
  weekly_minutes_max integer,

  notes              text,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references users(id) on delete set null,

  unique (school_id, staff_number),
  constraint teachers_phone_e164 check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  constraint teachers_weekly_bounds check (
    weekly_minutes_min is null or weekly_minutes_max is null
    or weekly_minutes_min <= weekly_minutes_max
  )
);

create index teachers_school_idx on teachers (school_id, status, last_name)
  where deleted_at is null;
create unique index teachers_user_key on teachers (school_id, user_id)
  where user_id is not null;

create trigger teachers_touch before update on teachers
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- teacher_subjects — qualifications
--
-- Distinctes des affectations : « sait enseigner les maths » n'est pas
-- « enseigne les maths a la 4e3 cette annee ».
-- -----------------------------------------------------------------------------

create table teacher_subjects (
  school_id  uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),

  primary key (teacher_id, subject_id)
);

create index teacher_subjects_subject_idx on teacher_subjects (subject_id);
create index teacher_subjects_school_idx on teacher_subjects (school_id);

-- -----------------------------------------------------------------------------
-- teacher_availability
--
-- UNAVAILABLE est une contrainte dure du solveur, AVOID une contrainte souple.
-- La distinction est portee par la donnee, pas par le code (§26).
-- -----------------------------------------------------------------------------

create table teacher_availability (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  teacher_id       uuid not null references teachers(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,

  day_of_week      smallint not null,   -- ISO : 1 = lundi … 7 = dimanche
  starts_at        time not null,
  ends_at          time not null,
  kind             availability_kind not null default 'UNAVAILABLE',
  reason           text,
  valid_from       date,
  valid_to         date,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint teacher_availability_day check (day_of_week between 1 and 7),
  constraint teacher_availability_range check (ends_at > starts_at),
  constraint teacher_availability_validity check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create index teacher_availability_lookup_idx
  on teacher_availability (teacher_id, academic_year_id, day_of_week);
create index teacher_availability_school_idx on teacher_availability (school_id);

create trigger teacher_availability_touch before update on teacher_availability
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Perimetre derive : l'enseignant que je suis
-- -----------------------------------------------------------------------------

create or replace function app.my_teacher_id(p_school uuid)
returns uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select t.id
  from public.teachers t
  where t.school_id = p_school
    and t.user_id = auth.uid()
    and t.deleted_at is null
  limit 1;
$$;

grant execute on function app.my_teacher_id(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
--
-- Tout membre voit l'annuaire des enseignants : un parent a besoin du nom du
-- professeur de son enfant, un eleve de celui qui figure sur son emploi du
-- temps. Les donnees sensibles (date de naissance, adresse, notes internes)
-- sont filtrees a la projection cote serveur, pas par une seconde table.
-- -----------------------------------------------------------------------------

alter table teachers enable row level security;
alter table teachers force  row level security;

create policy teachers_select on teachers for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy teachers_insert on teachers for insert to authenticated
with check (app.can_write(school_id, 'teachers.create'));

create policy teachers_update on teachers for update to authenticated
using (user_id = auth.uid() or app.can_write(school_id, 'teachers.update'))
with check (user_id = auth.uid() or app.can_write(school_id, 'teachers.update'));

create policy teachers_delete on teachers for delete to authenticated
using (app.can_write(school_id, 'teachers.delete'));

alter table teacher_subjects enable row level security;
alter table teacher_subjects force  row level security;

create policy teacher_subjects_select on teacher_subjects for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy teacher_subjects_insert on teacher_subjects for insert to authenticated
with check (app.can_write(school_id, 'teachers.update'));

create policy teacher_subjects_update on teacher_subjects for update to authenticated
using (app.can_write(school_id, 'teachers.update'))
with check (app.can_write(school_id, 'teachers.update'));

create policy teacher_subjects_delete on teacher_subjects for delete to authenticated
using (app.can_write(school_id, 'teachers.update'));

alter table teacher_availability enable row level security;
alter table teacher_availability force  row level security;

create policy teacher_availability_select on teacher_availability for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

-- Un enseignant declare ses propres indisponibilites ; les modifier pour
-- autrui exige teachers.manage_availability.
create policy teacher_availability_insert on teacher_availability for insert to authenticated
with check (
  teacher_id = app.my_teacher_id(school_id)
  or app.can_write(school_id, 'teachers.manage_availability')
);

create policy teacher_availability_update on teacher_availability for update to authenticated
using (
  teacher_id = app.my_teacher_id(school_id)
  or app.can_write(school_id, 'teachers.manage_availability')
)
with check (
  teacher_id = app.my_teacher_id(school_id)
  or app.can_write(school_id, 'teachers.manage_availability')
);

create policy teacher_availability_delete on teacher_availability for delete to authenticated
using (
  teacher_id = app.my_teacher_id(school_id)
  or app.can_write(school_id, 'teachers.manage_availability')
);

grant select, insert, update, delete on
  teachers, teacher_subjects, teacher_availability
to authenticated;
