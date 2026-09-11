-- =============================================================================
-- 0009 — Cycles et niveaux
-- =============================================================================
--
-- Structure entierement configurable (§12) : ni « 6e », ni « Terminale » n'est
-- code en dur. Le pack pays du seed propose une structure de depart, que
-- chaque etablissement peut remplacer.

create table cycles (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  code       text not null,
  name       text not null,
  sequence   integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (school_id, code)
);

create index cycles_school_idx on cycles (school_id, sequence);

create trigger cycles_touch before update on cycles
  for each row execute function app.touch_updated_at();

create table levels (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  cycle_id   uuid not null references cycles(id) on delete cascade,
  code       text not null,
  name       text not null,
  sequence   integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (school_id, code)
);

create index levels_cycle_idx on levels (cycle_id, sequence);
create index levels_school_idx on levels (school_id, sequence);

create trigger levels_touch before update on levels
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table cycles enable row level security;
alter table cycles force  row level security;

create policy cycles_select on cycles for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy cycles_insert on cycles for insert to authenticated
with check (app.can_write(school_id, 'cycles.manage'));

create policy cycles_update on cycles for update to authenticated
using (app.can_write(school_id, 'cycles.manage'))
with check (app.can_write(school_id, 'cycles.manage'));

create policy cycles_delete on cycles for delete to authenticated
using (app.can_write(school_id, 'cycles.manage'));

alter table levels enable row level security;
alter table levels force  row level security;

create policy levels_select on levels for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy levels_insert on levels for insert to authenticated
with check (app.can_write(school_id, 'levels.manage'));

create policy levels_update on levels for update to authenticated
using (app.can_write(school_id, 'levels.manage'))
with check (app.can_write(school_id, 'levels.manage'));

create policy levels_delete on levels for delete to authenticated
using (app.can_write(school_id, 'levels.manage'));

grant select, insert, update, delete on cycles, levels to authenticated;
