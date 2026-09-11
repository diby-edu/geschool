-- =============================================================================
-- 0013 — Classes et groupes pedagogiques
-- =============================================================================
--
-- Les groupes ne sont PAS un systeme de dedoublement (§71). Ce sont des
-- ensembles d'eleves reunis par un choix pedagogique — langue vivante, option,
-- activite — qui peuvent couvrir une classe ou plusieurs.

create type class_status as enum ('ACTIVE', 'ARCHIVED');
create type group_kind   as enum ('LANGUAGE', 'OPTION', 'ACTIVITY', 'PEDAGOGICAL', 'SUPPORT', 'OTHER');
create type group_status as enum ('ACTIVE', 'ARCHIVED');

-- -----------------------------------------------------------------------------
-- classes
-- -----------------------------------------------------------------------------

create table classes (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  level_id         uuid not null references levels(id) on delete restrict,

  code             text not null,
  name             text not null,
  capacity         integer not null default 0,

  -- Professeur principal : source du perimetre « sa classe » (docs/RBAC.md §3)
  head_teacher_id  uuid references teachers(id) on delete set null,
  -- Salle de rattachement par defaut, simple preference pour le solveur
  main_room_id     uuid references rooms(id) on delete set null,

  status           class_status not null default 'ACTIVE',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (school_id, academic_year_id, code),
  constraint classes_capacity_positive check (capacity >= 0)
);

create index classes_year_idx on classes (school_id, academic_year_id, status);
create index classes_level_idx on classes (level_id);
create index classes_head_teacher_idx on classes (head_teacher_id) where head_teacher_id is not null;

create trigger classes_touch before update on classes
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- groups
--
-- Un groupe peut couvrir une seule classe (« 4e3 – Espagnol ») ou plusieurs
-- (« Espagnol 4e », transverse a 4e1, 4e2 et 4e3). Le rattachement passe par
-- group_classes : une table de plus, et les deux cas du §16 sont couverts sans
-- introduire de concept de dedoublement.
-- -----------------------------------------------------------------------------

create table groups (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,

  code             text not null,
  name             text not null,
  kind             group_kind not null default 'PEDAGOGICAL',
  -- Renseigne pour un groupe de langue ou d'option ; NULL pour un groupe
  -- transverse a plusieurs matieres
  subject_id       uuid references subjects(id) on delete set null,
  max_size         integer,
  status           group_status not null default 'ACTIVE',

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (school_id, academic_year_id, code),
  constraint groups_max_size_positive check (max_size is null or max_size > 0)
);

create index groups_year_idx on groups (school_id, academic_year_id, status);
create index groups_subject_idx on groups (subject_id) where subject_id is not null;

create trigger groups_touch before update on groups
  for each row execute function app.touch_updated_at();

create table group_classes (
  school_id uuid not null references schools(id) on delete cascade,
  group_id  uuid not null references groups(id) on delete cascade,
  class_id  uuid not null references classes(id) on delete cascade,
  primary key (group_id, class_id)
);

create index group_classes_class_idx on group_classes (class_id);
create index group_classes_school_idx on group_classes (school_id);

comment on table group_classes is
  'Classes couvertes par un groupe. Le moteur d''emploi du temps s''en sert pour calculer le recouvrement groupe/classe : une seance de classe entiere et une seance de l''un de ses groupes ne peuvent pas etre simultanees.';

-- -----------------------------------------------------------------------------
-- Perimetre derive : la classe dont je suis professeur principal
-- -----------------------------------------------------------------------------

create or replace function app.is_head_teacher_of(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.classes c
    join public.teachers t on t.id = c.head_teacher_id
    where c.id = p_class
      and t.user_id = auth.uid()
      and t.deleted_at is null
  );
$$;

grant execute on function app.is_head_teacher_of(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table classes enable row level security;
alter table classes force  row level security;

create policy classes_select on classes for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy classes_insert on classes for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'classes.create'));

create policy classes_update on classes for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'classes.update'))
with check (app.can_write_year(school_id, academic_year_id, 'classes.update'));

create policy classes_delete on classes for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'classes.delete'));

alter table groups enable row level security;
alter table groups force  row level security;

create policy groups_select on groups for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy groups_insert on groups for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'groups.create'));

create policy groups_update on groups for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'groups.update'))
with check (app.can_write_year(school_id, academic_year_id, 'groups.update'));

create policy groups_delete on groups for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'groups.delete'));

alter table group_classes enable row level security;
alter table group_classes force  row level security;

create policy group_classes_select on group_classes for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy group_classes_insert on group_classes for insert to authenticated
with check (app.can_write(school_id, 'groups.update'));
create policy group_classes_update on group_classes for update to authenticated
using (app.can_write(school_id, 'groups.update')) with check (app.can_write(school_id, 'groups.update'));
create policy group_classes_delete on group_classes for delete to authenticated
using (app.can_write(school_id, 'groups.update'));

grant select, insert, update, delete on classes, groups, group_classes to authenticated;
