-- =============================================================================
-- 0012 — Salles, types, equipements, disponibilites
-- =============================================================================
--
-- Les quatre cas du §19 (aucune contrainte, salle preferee, salle imposee,
-- type impose) ne sont PAS portes ici : ils appartiennent a l'exigence
-- pedagogique (teaching_requirements). Une salle ne sait pas qui doit
-- l'utiliser ; c'est le besoin qui exprime sa contrainte.

create table room_types (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  code       text not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (school_id, code)
);

create index room_types_school_idx on room_types (school_id);

create trigger room_types_touch before update on room_types
  for each row execute function app.touch_updated_at();

create table room_features (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  code       text not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (school_id, code)
);

create index room_features_school_idx on room_features (school_id);

create trigger room_features_touch before update on room_features
  for each row execute function app.touch_updated_at();

create table rooms (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  room_type_id  uuid references room_types(id) on delete set null,

  code          text not null,
  name          text not null,
  capacity      integer not null default 0,
  building      text,
  floor         text,
  is_accessible boolean not null default true,
  is_active     boolean not null default true,
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (school_id, code),
  constraint rooms_capacity_positive check (capacity >= 0)
);

create index rooms_school_idx on rooms (school_id, is_active, code);
create index rooms_type_idx on rooms (room_type_id) where room_type_id is not null;

create trigger rooms_touch before update on rooms
  for each row execute function app.touch_updated_at();

create table room_room_features (
  school_id  uuid not null references schools(id) on delete cascade,
  room_id    uuid not null references rooms(id) on delete cascade,
  feature_id uuid not null references room_features(id) on delete cascade,
  primary key (room_id, feature_id)
);

create index room_room_features_feature_idx on room_room_features (feature_id);
create index room_room_features_school_idx on room_room_features (school_id);

create table room_availability (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  room_id          uuid not null references rooms(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,

  day_of_week      smallint not null,
  starts_at        time not null,
  ends_at          time not null,
  kind             availability_kind not null default 'UNAVAILABLE',
  reason           text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint room_availability_day check (day_of_week between 1 and 7),
  constraint room_availability_range check (ends_at > starts_at)
);

create index room_availability_lookup_idx
  on room_availability (room_id, academic_year_id, day_of_week);
create index room_availability_school_idx on room_availability (school_id);

create trigger room_availability_touch before update on room_availability
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table room_types enable row level security;
alter table room_types force  row level security;

create policy room_types_select on room_types for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy room_types_insert on room_types for insert to authenticated
with check (app.can_write(school_id, 'rooms.create'));
create policy room_types_update on room_types for update to authenticated
using (app.can_write(school_id, 'rooms.update')) with check (app.can_write(school_id, 'rooms.update'));
create policy room_types_delete on room_types for delete to authenticated
using (app.can_write(school_id, 'rooms.delete'));

alter table room_features enable row level security;
alter table room_features force  row level security;

create policy room_features_select on room_features for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy room_features_insert on room_features for insert to authenticated
with check (app.can_write(school_id, 'rooms.create'));
create policy room_features_update on room_features for update to authenticated
using (app.can_write(school_id, 'rooms.update')) with check (app.can_write(school_id, 'rooms.update'));
create policy room_features_delete on room_features for delete to authenticated
using (app.can_write(school_id, 'rooms.delete'));

alter table rooms enable row level security;
alter table rooms force  row level security;

create policy rooms_select on rooms for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy rooms_insert on rooms for insert to authenticated
with check (app.can_write(school_id, 'rooms.create'));
create policy rooms_update on rooms for update to authenticated
using (app.can_write(school_id, 'rooms.update')) with check (app.can_write(school_id, 'rooms.update'));
create policy rooms_delete on rooms for delete to authenticated
using (app.can_write(school_id, 'rooms.delete'));

alter table room_room_features enable row level security;
alter table room_room_features force  row level security;

create policy room_features_link_select on room_room_features for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy room_features_link_insert on room_room_features for insert to authenticated
with check (app.can_write(school_id, 'rooms.update'));
create policy room_features_link_update on room_room_features for update to authenticated
using (app.can_write(school_id, 'rooms.update')) with check (app.can_write(school_id, 'rooms.update'));
create policy room_features_link_delete on room_room_features for delete to authenticated
using (app.can_write(school_id, 'rooms.update'));

alter table room_availability enable row level security;
alter table room_availability force  row level security;

create policy room_availability_select on room_availability for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy room_availability_insert on room_availability for insert to authenticated
with check (app.can_write(school_id, 'rooms.manage_availability'));
create policy room_availability_update on room_availability for update to authenticated
using (app.can_write(school_id, 'rooms.manage_availability'))
with check (app.can_write(school_id, 'rooms.manage_availability'));
create policy room_availability_delete on room_availability for delete to authenticated
using (app.can_write(school_id, 'rooms.manage_availability'));

grant select, insert, update, delete on
  room_types, room_features, rooms, room_room_features, room_availability
to authenticated;
