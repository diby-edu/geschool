-- =============================================================================
-- 0008 — Annees scolaires, periodes, calendrier
-- =============================================================================

create type academic_year_status   as enum ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');
create type academic_period_kind   as enum ('TERM', 'SEMESTER', 'QUARTER');
create type academic_period_status as enum ('OPEN', 'GRADING', 'LOCKED', 'PUBLISHED');
create type calendar_event_kind    as enum (
  'HOLIDAY', 'VACATION', 'PUBLIC_HOLIDAY', 'EXAM', 'EVENT', 'CLOSURE'
);

-- -----------------------------------------------------------------------------
-- academic_years
-- -----------------------------------------------------------------------------

create table academic_years (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null,
  starts_on   date not null,
  ends_on     date not null,
  status      academic_year_status not null default 'DRAFT',
  is_current  boolean not null default false,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (school_id, name),
  constraint academic_years_dates check (ends_on > starts_on),
  constraint academic_years_settings_is_object check (jsonb_typeof(settings) = 'object')
);

-- Une seule annee courante par etablissement
create unique index academic_years_current_key
  on academic_years (school_id) where is_current;

create index academic_years_school_idx on academic_years (school_id, status);

create trigger academic_years_touch before update on academic_years
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- app.year_is_open — une annee clos ou archivee refuse toute ecriture (§11)
-- -----------------------------------------------------------------------------

create or replace function app.year_is_open(p_year uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select p_year is null or exists (
    select 1 from public.academic_years y
    where y.id = p_year and y.status in ('DRAFT', 'ACTIVE')
  );
$$;

grant execute on function app.year_is_open(uuid) to authenticated, service_role;

-- Ecriture sur une donnee rattachee a une annee : etablissement inscriptible,
-- permission presente, ET annee non clos.
create or replace function app.can_write_year(p_school uuid, p_year uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select app.is_platform_admin()
      or (app.can_write(p_school, p_code) and app.year_is_open(p_year));
$$;

grant execute on function app.can_write_year(uuid, uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- academic_periods — absorbe grading_periods (ADR-011)
-- -----------------------------------------------------------------------------

create table academic_periods (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(id) on delete cascade,
  academic_year_id  uuid not null references academic_years(id) on delete cascade,
  name              text not null,
  sequence          integer not null,
  kind              academic_period_kind not null default 'TERM',
  starts_on         date not null,
  ends_on           date not null,
  is_grading_period boolean not null default true,
  weight            numeric(6,3) not null default 1,
  status            academic_period_status not null default 'OPEN',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (academic_year_id, sequence),
  constraint academic_periods_dates check (ends_on > starts_on),
  constraint academic_periods_weight_positive check (weight > 0)
);

create index academic_periods_year_idx
  on academic_periods (academic_year_id, sequence);
create index academic_periods_school_idx on academic_periods (school_id);

create trigger academic_periods_touch before update on academic_periods
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- school_calendar_events
--
-- Cette table pilote la generation des session_occurrences (ADR-002) : une
-- date couverte par un evenement `blocks_schedule` ne produit aucune seance.
-- -----------------------------------------------------------------------------

create table school_calendar_events (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  kind             calendar_event_kind not null,
  name             text not null,
  starts_on        date not null,
  ends_on          date not null,
  blocks_schedule  boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint school_calendar_events_dates check (ends_on >= starts_on)
);

create index school_calendar_events_range_idx
  on school_calendar_events (academic_year_id, starts_on, ends_on)
  where blocks_schedule;
create index school_calendar_events_school_idx on school_calendar_events (school_id);

create trigger school_calendar_events_touch before update on school_calendar_events
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
--
-- Lecture ouverte a tout membre : l'annee courante, les periodes et le
-- calendrier conditionnent l'affichage de toute l'application.
-- -----------------------------------------------------------------------------

alter table academic_years enable row level security;
alter table academic_years force  row level security;

create policy academic_years_select on academic_years for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy academic_years_insert on academic_years for insert to authenticated
with check (app.can_write(school_id, 'academic_years.manage'));

create policy academic_years_update on academic_years for update to authenticated
using (app.can_write(school_id, 'academic_years.manage'))
with check (app.can_write(school_id, 'academic_years.manage'));

create policy academic_years_delete on academic_years for delete to authenticated
using (app.can_write(school_id, 'academic_years.manage'));

alter table academic_periods enable row level security;
alter table academic_periods force  row level security;

create policy academic_periods_select on academic_periods for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy academic_periods_insert on academic_periods for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'academic_years.manage'));

create policy academic_periods_update on academic_periods for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'academic_years.manage'))
with check (app.can_write_year(school_id, academic_year_id, 'academic_years.manage'));

create policy academic_periods_delete on academic_periods for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'academic_years.manage'));

alter table school_calendar_events enable row level security;
alter table school_calendar_events force  row level security;

create policy calendar_select on school_calendar_events for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy calendar_insert on school_calendar_events for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'academic_years.manage'));

create policy calendar_update on school_calendar_events for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'academic_years.manage'))
with check (app.can_write_year(school_id, academic_year_id, 'academic_years.manage'));

create policy calendar_delete on school_calendar_events for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'academic_years.manage'));

grant select, insert, update, delete on
  academic_years, academic_periods, school_calendar_events
to authenticated;
