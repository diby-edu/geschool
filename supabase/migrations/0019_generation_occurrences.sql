-- =============================================================================
-- 0019 — Conflits, jobs de generation, occurrences datees
-- =============================================================================

create type conflict_severity     as enum ('HARD', 'WARNING', 'INFO');
create type conflict_status       as enum ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED');
create type generation_job_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
create type solver_status         as enum ('OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'TIME_LIMIT', 'UNKNOWN');
create type occurrence_status     as enum ('SCHEDULED', 'CANCELLED', 'MOVED', 'REPLACED', 'DONE');

-- -----------------------------------------------------------------------------
-- schedule_conflicts
--
-- `description` est redigee pour un directeur, jamais pour un ingenieur
-- (additif §30). Les identifiants techniques restent dans `involved`.
-- -----------------------------------------------------------------------------

create table schedule_conflicts (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references schools(id) on delete cascade,
  schedule_version_id  uuid not null references schedule_versions(id) on delete cascade,
  session_id           uuid references schedule_sessions(id) on delete cascade,

  conflict_type        text not null,
  severity             conflict_severity not null default 'HARD',
  title                text not null,
  description          text not null,
  involved             jsonb not null default '{}'::jsonb,
  suggested_resolution text,
  status               conflict_status not null default 'OPEN',

  detected_at          timestamptz not null default now(),
  resolved_at          timestamptz,
  resolved_by          uuid references users(id) on delete set null,

  constraint schedule_conflicts_involved_is_object check (jsonb_typeof(involved) = 'object')
);

create index schedule_conflicts_version_idx
  on schedule_conflicts (schedule_version_id, severity, status);
create index schedule_conflicts_session_idx
  on schedule_conflicts (session_id) where session_id is not null;
create index schedule_conflicts_school_idx on schedule_conflicts (school_id);

-- -----------------------------------------------------------------------------
-- schedule_generation_jobs — observabilite (additif §39)
-- Jamais de secret ni de donnee personnelle dans `diagnostics`.
-- -----------------------------------------------------------------------------

create table schedule_generation_jobs (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  academic_year_id    uuid not null references academic_years(id) on delete cascade,
  schedule_version_id uuid references schedule_versions(id) on delete set null,

  requested_by        uuid references users(id) on delete set null,
  status              generation_job_status not null default 'QUEUED',
  options             jsonb not null default '{}'::jsonb,
  current_step        text,

  solver_status       solver_status,
  score               numeric(6,2),
  hard_satisfied      boolean,
  soft_ratio          numeric(5,4),
  sessions_count      integer,
  variables_count     integer,
  constraints_count   integer,
  duration_ms         integer,

  diagnostics         jsonb not null default '{}'::jsonb,
  error               jsonb,

  -- Rejouer une demande identique ne relance pas un calcul de plusieurs
  -- minutes sur l'unique vCPU (ADR-014).
  idempotency_key     text,

  queued_at           timestamptz not null default now(),
  started_at          timestamptz,
  finished_at         timestamptz,

  constraint generation_jobs_options_is_object check (jsonb_typeof(options) = 'object'),
  constraint generation_jobs_soft_ratio check (soft_ratio is null or (soft_ratio >= 0 and soft_ratio <= 1))
);

create unique index generation_jobs_idempotency_key
  on schedule_generation_jobs (school_id, idempotency_key) where idempotency_key is not null;
create index generation_jobs_school_idx
  on schedule_generation_jobs (school_id, status, queued_at desc);

-- Une seule generation a la fois sur toute la plateforme : le VPS n'a qu'un
-- vCPU partage avec huit sites en production (ADR-014). L'index partiel rend
-- la contrainte structurelle plutot que declarative.
create unique index generation_jobs_single_running
  on schedule_generation_jobs ((true)) where status = 'RUNNING';

alter table schedule_versions
  add constraint schedule_versions_generation_job_fk
  foreign key (generation_job_id) references schedule_generation_jobs(id) on delete set null;

-- -----------------------------------------------------------------------------
-- session_occurrences — le reel date (ADR-002)
--
-- Produites a la publication par le job schedule.materialize, en excluant les
-- dates couvertes par un school_calendar_events.blocks_schedule.
--
-- C'est ici que vivent les exceptions : annulation, remplacement ponctuel
-- d'enseignant, deplacement d'une seule seance. La trame reste intacte.
-- -----------------------------------------------------------------------------

create table session_occurrences (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  academic_year_id    uuid not null references academic_years(id) on delete cascade,
  schedule_session_id uuid not null references schedule_sessions(id) on delete cascade,

  occurs_on           date not null,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,

  status              occurrence_status not null default 'SCHEDULED',
  override_room_id    uuid references rooms(id) on delete set null,
  override_teacher_id uuid references teachers(id) on delete set null,
  override_starts_at  timestamptz,
  override_ends_at    timestamptz,
  cancellation_reason text,

  generated_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (schedule_session_id, occurs_on),
  constraint session_occurrences_range check (ends_at > starts_at),
  constraint session_occurrences_override_range check (
    override_starts_at is null or override_ends_at is null or override_ends_at > override_starts_at
  )
);

create index session_occurrences_date_idx on session_occurrences (school_id, occurs_on, status);
create index session_occurrences_session_idx on session_occurrences (schedule_session_id);
create index session_occurrences_year_idx on session_occurrences (school_id, academic_year_id, occurs_on);

create trigger session_occurrences_touch before update on session_occurrences
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table schedule_conflicts enable row level security;
alter table schedule_conflicts force  row level security;

create policy conflicts_select on schedule_conflicts for select to authenticated
using (app.can_read(school_id, 'schedule.view_all'));
create policy conflicts_insert on schedule_conflicts for insert to authenticated
with check (app.can_write(school_id, 'schedule.update'));
create policy conflicts_update on schedule_conflicts for update to authenticated
using (app.can_write(school_id, 'schedule.update')) with check (app.can_write(school_id, 'schedule.update'));
create policy conflicts_delete on schedule_conflicts for delete to authenticated
using (app.can_write(school_id, 'schedule.delete'));

alter table schedule_generation_jobs enable row level security;
alter table schedule_generation_jobs force  row level security;

create policy generation_jobs_select on schedule_generation_jobs for select to authenticated
using (app.can_read(school_id, 'schedule.generate'));
create policy generation_jobs_insert on schedule_generation_jobs for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'schedule.generate'));
create policy generation_jobs_update on schedule_generation_jobs for update to authenticated
using (app.can_write(school_id, 'schedule.generate')) with check (app.can_write(school_id, 'schedule.generate'));
create policy generation_jobs_delete on schedule_generation_jobs for delete to authenticated
using (app.is_platform_admin());

alter table session_occurrences enable row level security;
alter table session_occurrences force  row level security;

create policy occurrences_select on session_occurrences for select to authenticated
using (app.can_see_session(school_id, schedule_session_id));
create policy occurrences_insert on session_occurrences for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'schedule.publish'));
create policy occurrences_update on session_occurrences for update to authenticated
using (app.can_write(school_id, 'schedule.update')) with check (app.can_write(school_id, 'schedule.update'));
create policy occurrences_delete on session_occurrences for delete to authenticated
using (app.can_write(school_id, 'schedule.delete'));

grant select, insert, update, delete on
  schedule_conflicts, schedule_generation_jobs, session_occurrences
to authenticated;
