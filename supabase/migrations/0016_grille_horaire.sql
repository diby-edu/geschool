-- =============================================================================
-- 0016 — Configuration horaire et grille de creneaux
-- =============================================================================
--
-- Aucun jour, aucune heure, aucune duree n'est code en dur (§23, §24).
-- La grille peut differer d'un jour a l'autre : un mercredi a trois creneaux
-- matinaux et un lundi a six cohabitent sans traitement particulier.

create type schedule_config_status as enum ('DRAFT', 'ACTIVE', 'ARCHIVED');
create type time_slot_kind         as enum ('TEACHING', 'BREAK', 'LUNCH');

create table schedule_configurations (
  id                        uuid primary key default gen_random_uuid(),
  school_id                 uuid not null references schools(id) on delete cascade,
  academic_year_id          uuid not null references academic_years(id) on delete cascade,

  name                      text not null,
  -- Jours ouvres, ISO 1..7. Chaque etablissement choisit les siens (§24).
  working_days              smallint[] not null default '{1,2,3,4,5}',
  day_starts_at             time not null default '07:30',
  day_ends_at               time not null default '18:00',

  default_session_minutes   integer not null default 55,
  slot_granularity_minutes  integer not null default 5,
  allow_multi_slot_sessions boolean not null default true,

  -- Options du solveur : plafond de temps, profil d'optimisation, poids par
  -- defaut. Valide par Zod cote application.
  solver_options            jsonb not null default '{}'::jsonb,

  is_default                boolean not null default false,
  status                    schedule_config_status not null default 'DRAFT',

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint schedule_configurations_hours check (day_ends_at > day_starts_at),
  constraint schedule_configurations_session_minutes check (default_session_minutes between 15 and 480),
  constraint schedule_configurations_granularity check (slot_granularity_minutes between 1 and 60),
  constraint schedule_configurations_days_valid check (
    working_days <@ '{1,2,3,4,5,6,7}'::smallint[] and array_length(working_days, 1) >= 1
  ),
  constraint schedule_configurations_solver_options_is_object
    check (jsonb_typeof(solver_options) = 'object')
);

create unique index schedule_configurations_default_key
  on schedule_configurations (school_id, academic_year_id) where is_default;
create index schedule_configurations_year_idx
  on schedule_configurations (school_id, academic_year_id, status);

create trigger schedule_configurations_touch before update on schedule_configurations
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- time_slots — la grille, jour par jour
--
-- `position` numerote les creneaux d'une journee. Une seance longue occupe
-- plusieurs creneaux CONTIGUS du meme jour (§23) ; c'est ce qui permet au
-- solveur de traiter nativement les durees variables.
-- -----------------------------------------------------------------------------

create table time_slots (
  id                         uuid primary key default gen_random_uuid(),
  school_id                  uuid not null references schools(id) on delete cascade,
  academic_year_id           uuid not null references academic_years(id) on delete cascade,
  schedule_configuration_id  uuid not null references schedule_configurations(id) on delete cascade,

  day_of_week                smallint not null,
  position                   integer not null,
  starts_at                  time not null,
  ends_at                    time not null,
  kind                       time_slot_kind not null default 'TEACHING',
  label                      text,

  created_at                 timestamptz not null default now(),

  unique (schedule_configuration_id, day_of_week, position),
  constraint time_slots_day check (day_of_week between 1 and 7),
  constraint time_slots_range check (ends_at > starts_at),
  constraint time_slots_position_positive check (position >= 0)
);

create index time_slots_config_idx
  on time_slots (schedule_configuration_id, day_of_week, position);
create index time_slots_school_idx on time_slots (school_id, academic_year_id);

comment on column time_slots.position is
  'Rang du creneau dans la journee. La contiguite de deux creneaux se lit sur ce champ, pas sur les heures : deux jours peuvent avoir des grilles differentes.';

-- -----------------------------------------------------------------------------
-- RLS
--
-- Lecture ouverte a tout membre : la grille conditionne l'affichage de tous
-- les emplois du temps, y compris ceux des parents et des eleves.
-- -----------------------------------------------------------------------------

alter table schedule_configurations enable row level security;
alter table schedule_configurations force  row level security;

create policy schedule_config_select on schedule_configurations for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy schedule_config_insert on schedule_configurations for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'schedule.manage_configuration'));

create policy schedule_config_update on schedule_configurations for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.manage_configuration'))
with check (app.can_write_year(school_id, academic_year_id, 'schedule.manage_configuration'));

create policy schedule_config_delete on schedule_configurations for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.manage_configuration'));

alter table time_slots enable row level security;
alter table time_slots force  row level security;

create policy time_slots_select on time_slots for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy time_slots_insert on time_slots for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'schedule.manage_configuration'));

create policy time_slots_update on time_slots for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.manage_configuration'))
with check (app.can_write_year(school_id, academic_year_id, 'schedule.manage_configuration'));

create policy time_slots_delete on time_slots for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.manage_configuration'));

grant select, insert, update, delete on
  schedule_configurations, time_slots
to authenticated;
