-- =============================================================================
-- 0018 — Emploi du temps : versions, seances, contraintes
-- =============================================================================
--
-- schedule_sessions est la SOURCE DE VERITE UNIQUE (§24 de l'additif solveur).
-- Les vues « classe », « enseignant », « groupe » et « salle » du §37 en sont
-- derivees ; aucune n'est materialisee.
--
-- Le §21 proposait teacher_id, class_id et room_id au singulier sur la seance.
-- Tel quel, cela rendait impossibles le co-enseignement (§31), les cours
-- communs (§30) et les salles multiples, tous exiges par ailleurs. Trois
-- tables de liaison les remplacent.

create type schedule_version_status as enum ('DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED');
create type schedule_version_source as enum ('MANUAL', 'GENERATED');
create type schedule_session_status as enum ('PLANNED', 'CONFIRMED', 'SUSPENDED');
create type session_target_type     as enum ('CLASS', 'GROUP');
create type constraint_severity     as enum ('HARD', 'SOFT');
create type constraint_scope_type   as enum (
  'SCHOOL', 'LEVEL', 'CLASS', 'GROUP', 'SUBJECT', 'TEACHER', 'ROOM', 'TASKS'
);

-- -----------------------------------------------------------------------------
-- schedule_versions
--
-- Une generation ne remplace JAMAIS la version publiee (additif §61) : elle
-- cree un DRAFT. L'index unique partiel garantit qu'une seule version est
-- publiee a la fois, par annee et par etablissement.
-- -----------------------------------------------------------------------------

create table schedule_versions (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  academic_year_id    uuid not null references academic_years(id) on delete cascade,

  number              integer not null,
  name                text not null,
  status              schedule_version_status not null default 'DRAFT',
  source              schedule_version_source not null default 'MANUAL',
  generation_job_id   uuid,

  effective_from      date,
  published_at        timestamptz,
  published_by        uuid references users(id) on delete set null,
  notes               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references users(id) on delete set null,

  unique (school_id, academic_year_id, number),
  constraint schedule_versions_published_consistency check (
    (status = 'PUBLISHED' and published_at is not null)
    or (status <> 'PUBLISHED')
  )
);

create unique index schedule_versions_published_key
  on schedule_versions (school_id, academic_year_id) where status = 'PUBLISHED';
create index schedule_versions_year_idx
  on schedule_versions (school_id, academic_year_id, status);

create trigger schedule_versions_touch before update on schedule_versions
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- schedule_sessions — la trame hebdomadaire (ADR-002)
--
-- Une seance n'est pas datee : elle dit « le mardi, creneaux 3 a 4 ». Les
-- occurrences datees sont produites a la publication (migration 0019).
-- -----------------------------------------------------------------------------

create table schedule_sessions (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null references schools(id) on delete cascade,
  academic_year_id        uuid not null references academic_years(id) on delete cascade,
  schedule_version_id     uuid not null references schedule_versions(id) on delete cascade,

  teaching_requirement_id uuid references teaching_requirements(id) on delete set null,
  subject_id              uuid not null references subjects(id) on delete restrict,

  day_of_week             smallint not null,
  start_slot_id           uuid not null references time_slots(id) on delete restrict,
  end_slot_id             uuid not null references time_slots(id) on delete restrict,
  -- Denormalises depuis les creneaux : evitent une jointure sur chaque
  -- affichage d'emploi du temps, qui est l'ecran le plus consulte.
  starts_at               time not null,
  ends_at                 time not null,
  duration_minutes        integer not null,

  -- Une seance verrouillee n'est jamais deplacee par une generation (§35)
  is_locked               boolean not null default false,
  status                  schedule_session_status not null default 'PLANNED',
  notes                   text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint schedule_sessions_day check (day_of_week between 1 and 7),
  constraint schedule_sessions_range check (ends_at > starts_at),
  constraint schedule_sessions_duration_positive check (duration_minutes > 0)
);

create index schedule_sessions_version_idx
  on schedule_sessions (schedule_version_id, day_of_week, starts_at);
create index schedule_sessions_school_idx
  on schedule_sessions (school_id, academic_year_id);
create index schedule_sessions_subject_idx on schedule_sessions (subject_id);
create index schedule_sessions_requirement_idx
  on schedule_sessions (teaching_requirement_id) where teaching_requirement_id is not null;

create trigger schedule_sessions_touch before update on schedule_sessions
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Liaisons : enseignants, cibles, salles
-- -----------------------------------------------------------------------------

create table schedule_session_teachers (
  school_id  uuid not null references schools(id) on delete cascade,
  session_id uuid not null references schedule_sessions(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  role       teacher_role not null default 'LEAD',
  primary key (session_id, teacher_id)
);

create index session_teachers_teacher_idx on schedule_session_teachers (teacher_id);
create index session_teachers_school_idx on schedule_session_teachers (school_id);

-- Plusieurs lignes = cours commun a plusieurs groupes (§30). C'est ce qui
-- permet a « 4e3 Espagnol » et « 4e3 Allemand » d'etre simultanes sans
-- conflit de classe, tout en interdisant deux cours au meme groupe.
create table schedule_session_targets (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  session_id  uuid not null references schedule_sessions(id) on delete cascade,
  target_type session_target_type not null,
  class_id    uuid references classes(id) on delete cascade,
  group_id    uuid references groups(id) on delete cascade,

  constraint session_targets_coherent check (
    (target_type = 'CLASS' and class_id is not null and group_id is null)
    or (target_type = 'GROUP' and group_id is not null and class_id is null)
  )
);

create unique index session_targets_key
  on schedule_session_targets (session_id, target_type, coalesce(class_id, group_id));
create index session_targets_class_idx
  on schedule_session_targets (class_id) where class_id is not null;
create index session_targets_group_idx
  on schedule_session_targets (group_id) where group_id is not null;
create index session_targets_school_idx on schedule_session_targets (school_id);

create table schedule_session_rooms (
  school_id  uuid not null references schools(id) on delete cascade,
  session_id uuid not null references schedule_sessions(id) on delete cascade,
  room_id    uuid not null references rooms(id) on delete cascade,
  is_primary boolean not null default true,
  primary key (session_id, room_id)
);

create index session_rooms_room_idx on schedule_session_rooms (room_id);
create index session_rooms_school_idx on schedule_session_rooms (school_id);

-- -----------------------------------------------------------------------------
-- schedule_constraints — registre configurable (additif §46, §47)
--
-- Ajouter une contrainte = une entree dans le registre applicatif et une ligne
-- ici. Aucune migration, aucune regle pedagogique en dur. L'exemple EPS du §28
-- est exactement cela : deux lignes portees sur la matiere EPS.
-- -----------------------------------------------------------------------------

create table schedule_constraints (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,

  -- Cle du registre applicatif : TEACHER_NO_OVERLAP, PREFERRED_ROOM, …
  constraint_code  text not null,
  severity         constraint_severity not null default 'SOFT',
  weight           integer not null default 10,
  is_enabled       boolean not null default true,

  scope_type       constraint_scope_type not null default 'SCHOOL',
  scope_id         uuid,
  parameters       jsonb not null default '{}'::jsonb,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references users(id) on delete set null,

  constraint schedule_constraints_weight_positive check (weight >= 0),
  constraint schedule_constraints_parameters_is_object
    check (jsonb_typeof(parameters) = 'object'),
  -- Une contrainte dure n'a pas de poids : elle est absolue
  constraint schedule_constraints_hard_weight check (severity <> 'HARD' or weight = 0),
  constraint schedule_constraints_scope_target check (
    scope_type = 'SCHOOL' or scope_type = 'TASKS' or scope_id is not null
  )
);

create index schedule_constraints_year_idx
  on schedule_constraints (school_id, academic_year_id, is_enabled);
create index schedule_constraints_scope_idx
  on schedule_constraints (scope_type, scope_id) where scope_id is not null;

create trigger schedule_constraints_touch before update on schedule_constraints
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Visibilite d'une seance
--
-- Le personnel voit toutes les versions. Un enseignant voit les seances qu'il
-- assure. Un parent ou un eleve ne voit que la version PUBLIEE, et seulement
-- les seances qui concernent l'eleve : sa classe, ou l'un de ses groupes.
--
-- La restriction a la version publiee est essentielle : un brouillon en cours
-- d'arbitrage ne doit jamais apparaitre dans l'espace des familles.
-- -----------------------------------------------------------------------------

create or replace function app.can_see_session(p_school uuid, p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select app.is_platform_admin()
      or (app.is_member_of(p_school) and app.has_permission(p_school, 'schedule.view_all'))
      or exists (
        select 1
        from public.schedule_session_teachers st
        join public.teachers t on t.id = st.teacher_id
        where st.session_id = p_session
          and t.user_id = auth.uid()
          and t.deleted_at is null
      )
      or exists (
        select 1
        from public.schedule_sessions s
        join public.schedule_versions v on v.id = s.schedule_version_id
        join public.schedule_session_targets tg on tg.session_id = s.id
        left join public.student_enrollments se
          on se.class_id = tg.class_id
         and se.academic_year_id = s.academic_year_id
         and se.status = 'ENROLLED'
        left join public.student_groups sg
          on sg.group_id = tg.group_id
         and sg.academic_year_id = s.academic_year_id
         and sg.left_at is null
        where s.id = p_session
          and v.status = 'PUBLISHED'
          and coalesce(se.student_id, sg.student_id) = any (app.my_student_ids(p_school))
      );
$$;

grant execute on function app.can_see_session(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table schedule_versions enable row level security;
alter table schedule_versions force  row level security;

-- Les familles ne voient que la version publiee
create policy schedule_versions_select on schedule_versions for select to authenticated
using (
  app.is_platform_admin()
  or (app.is_member_of(school_id) and app.has_permission(school_id, 'schedule.view_all'))
  or (app.is_member_of(school_id) and status = 'PUBLISHED')
);

create policy schedule_versions_insert on schedule_versions for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'schedule.create'));

create policy schedule_versions_update on schedule_versions for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.update'))
with check (app.can_write_year(school_id, academic_year_id, 'schedule.update'));

create policy schedule_versions_delete on schedule_versions for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.delete'));

alter table schedule_sessions enable row level security;
alter table schedule_sessions force  row level security;

create policy schedule_sessions_select on schedule_sessions for select to authenticated
using (app.can_see_session(school_id, id));

create policy schedule_sessions_insert on schedule_sessions for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'schedule.create'));

create policy schedule_sessions_update on schedule_sessions for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.update'))
with check (app.can_write_year(school_id, academic_year_id, 'schedule.update'));

create policy schedule_sessions_delete on schedule_sessions for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.delete'));

alter table schedule_session_teachers enable row level security;
alter table schedule_session_teachers force  row level security;

create policy session_teachers_select on schedule_session_teachers for select to authenticated
using (app.can_see_session(school_id, session_id));
create policy session_teachers_insert on schedule_session_teachers for insert to authenticated
with check (app.can_write(school_id, 'schedule.create'));
create policy session_teachers_update on schedule_session_teachers for update to authenticated
using (app.can_write(school_id, 'schedule.update')) with check (app.can_write(school_id, 'schedule.update'));
create policy session_teachers_delete on schedule_session_teachers for delete to authenticated
using (app.can_write(school_id, 'schedule.delete'));

alter table schedule_session_targets enable row level security;
alter table schedule_session_targets force  row level security;

create policy session_targets_select on schedule_session_targets for select to authenticated
using (app.can_see_session(school_id, session_id));
create policy session_targets_insert on schedule_session_targets for insert to authenticated
with check (app.can_write(school_id, 'schedule.create'));
create policy session_targets_update on schedule_session_targets for update to authenticated
using (app.can_write(school_id, 'schedule.update')) with check (app.can_write(school_id, 'schedule.update'));
create policy session_targets_delete on schedule_session_targets for delete to authenticated
using (app.can_write(school_id, 'schedule.delete'));

alter table schedule_session_rooms enable row level security;
alter table schedule_session_rooms force  row level security;

create policy session_rooms_select on schedule_session_rooms for select to authenticated
using (app.can_see_session(school_id, session_id));
create policy session_rooms_insert on schedule_session_rooms for insert to authenticated
with check (app.can_write(school_id, 'schedule.create'));
create policy session_rooms_update on schedule_session_rooms for update to authenticated
using (app.can_write(school_id, 'schedule.update')) with check (app.can_write(school_id, 'schedule.update'));
create policy session_rooms_delete on schedule_session_rooms for delete to authenticated
using (app.can_write(school_id, 'schedule.delete'));

alter table schedule_constraints enable row level security;
alter table schedule_constraints force  row level security;

create policy schedule_constraints_select on schedule_constraints for select to authenticated
using (app.can_read(school_id, 'schedule.view'));
create policy schedule_constraints_insert on schedule_constraints for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'schedule.manage_constraints'));
create policy schedule_constraints_update on schedule_constraints for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.manage_constraints'))
with check (app.can_write_year(school_id, academic_year_id, 'schedule.manage_constraints'));
create policy schedule_constraints_delete on schedule_constraints for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.manage_constraints'));

grant select, insert, update, delete on
  schedule_versions, schedule_sessions, schedule_session_teachers,
  schedule_session_targets, schedule_session_rooms, schedule_constraints
to authenticated;
