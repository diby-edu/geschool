-- =============================================================================
-- 0017 — Exigences pedagogiques
-- =============================================================================
--
-- Separation stricte (§22, additif solveur §6) :
--
--   TEACHING REQUIREMENT   le besoin — « 4e3, Espagnol, 3 h/semaine,
--                          2 seances, groupe Espagnol, Professeur X »
--   SCHEDULE SESSION       la seance placee — « mardi, creneaux 3-4 »
--
-- Le moteur transforme les premieres en secondes. Confondre les deux, c'est
-- perdre la capacite de regenerer un emploi du temps sans ressaisir le besoin.

create type room_requirement_mode as enum (
  'NONE',           -- n'importe quelle salle compatible
  'PREFERRED',      -- preference souple
  'REQUIRED_ROOM',  -- salle imposee, contrainte dure
  'REQUIRED_TYPE'   -- type de salle impose, contrainte dure
);

create type requirement_status     as enum ('DRAFT', 'ACTIVE', 'SATISFIED', 'IGNORED');
create type requirement_target_type as enum ('CLASS', 'GROUP');
create type teacher_role            as enum ('LEAD', 'ASSISTANT');

create table teaching_requirements (
  id                       uuid primary key default gen_random_uuid(),
  school_id                uuid not null references schools(id) on delete cascade,
  academic_year_id         uuid not null references academic_years(id) on delete cascade,
  subject_id               uuid not null references subjects(id) on delete restrict,
  -- Trace l'origine ; une exigence peut aussi etre saisie a la main
  teaching_assignment_id   uuid references teaching_assignments(id) on delete set null,

  weekly_minutes           integer not null,
  sessions_count           integer not null default 1,
  -- NULL = deduite de weekly_minutes / sessions_count
  session_duration_minutes integer,
  -- Durees autorisees quand les seances n'ont pas toutes la meme longueur
  allowed_durations        integer[],

  room_requirement_mode    room_requirement_mode not null default 'NONE',
  required_room_id         uuid references rooms(id) on delete set null,
  required_room_type_id    uuid references room_types(id) on delete set null,
  preferred_room_id        uuid references rooms(id) on delete set null,
  min_capacity             integer,
  required_features        uuid[] not null default '{}',

  priority                 integer not null default 100,
  status                   requirement_status not null default 'ACTIVE',
  notes                    text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint teaching_requirements_minutes_positive check (weekly_minutes > 0),
  constraint teaching_requirements_sessions_positive check (sessions_count > 0),
  constraint teaching_requirements_duration_positive
    check (session_duration_minutes is null or session_duration_minutes > 0),
  constraint teaching_requirements_min_capacity
    check (min_capacity is null or min_capacity >= 0),
  -- Le mode choisi doit designer ce qu'il annonce
  constraint teaching_requirements_room_mode_coherent check (
    (room_requirement_mode = 'REQUIRED_ROOM' and required_room_id is not null)
    or (room_requirement_mode = 'REQUIRED_TYPE' and required_room_type_id is not null)
    or (room_requirement_mode = 'PREFERRED' and preferred_room_id is not null)
    or room_requirement_mode = 'NONE'
  )
);

create index teaching_requirements_year_idx
  on teaching_requirements (school_id, academic_year_id, status);
create index teaching_requirements_subject_idx on teaching_requirements (subject_id);
create index teaching_requirements_assignment_idx
  on teaching_requirements (teaching_assignment_id) where teaching_assignment_id is not null;

create trigger teaching_requirements_touch before update on teaching_requirements
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- teaching_requirement_targets
--
-- Plusieurs lignes = COURS COMMUN a plusieurs groupes (§30) : une seule seance
-- sera produite, ciblant toutes ces entites. A ne pas confondre avec deux
-- exigences distinctes, qui produiraient deux seances independantes.
-- -----------------------------------------------------------------------------

create table teaching_requirement_targets (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id) on delete cascade,
  requirement_id uuid not null references teaching_requirements(id) on delete cascade,
  target_type    requirement_target_type not null,
  class_id       uuid references classes(id) on delete cascade,
  group_id       uuid references groups(id) on delete cascade,

  constraint requirement_targets_coherent check (
    (target_type = 'CLASS' and class_id is not null and group_id is null)
    or (target_type = 'GROUP' and group_id is not null and class_id is null)
  )
);

create unique index requirement_targets_key
  on teaching_requirement_targets (
    requirement_id,
    target_type,
    coalesce(class_id, group_id)
  );
create index requirement_targets_class_idx
  on teaching_requirement_targets (class_id) where class_id is not null;
create index requirement_targets_group_idx
  on teaching_requirement_targets (group_id) where group_id is not null;
create index requirement_targets_school_idx on teaching_requirement_targets (school_id);

-- -----------------------------------------------------------------------------
-- teaching_requirement_teachers
--
-- Plusieurs lignes = CO-ENSEIGNEMENT sur une meme seance.
--
-- A distinguer du volume partage du §31 : « Professeur A 3 h, Professeur B
-- 2 h » sur la meme classe et la meme matiere, ce sont DEUX exigences avec
-- un enseignant chacune, pas une exigence a deux enseignants.
-- -----------------------------------------------------------------------------

create table teaching_requirement_teachers (
  school_id      uuid not null references schools(id) on delete cascade,
  requirement_id uuid not null references teaching_requirements(id) on delete cascade,
  teacher_id     uuid not null references teachers(id) on delete cascade,
  role           teacher_role not null default 'LEAD',
  primary key (requirement_id, teacher_id)
);

create index requirement_teachers_teacher_idx on teaching_requirement_teachers (teacher_id);
create index requirement_teachers_school_idx on teaching_requirement_teachers (school_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table teaching_requirements enable row level security;
alter table teaching_requirements force  row level security;

create policy requirements_select on teaching_requirements for select to authenticated
using (app.can_read(school_id, 'schedule.view'));

create policy requirements_insert on teaching_requirements for insert to authenticated
with check (app.can_write_year(school_id, academic_year_id, 'schedule.create'));

create policy requirements_update on teaching_requirements for update to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.update'))
with check (app.can_write_year(school_id, academic_year_id, 'schedule.update'));

create policy requirements_delete on teaching_requirements for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'schedule.delete'));

alter table teaching_requirement_targets enable row level security;
alter table teaching_requirement_targets force  row level security;

create policy requirement_targets_select on teaching_requirement_targets for select to authenticated
using (app.can_read(school_id, 'schedule.view'));
create policy requirement_targets_insert on teaching_requirement_targets for insert to authenticated
with check (app.can_write(school_id, 'schedule.create'));
create policy requirement_targets_update on teaching_requirement_targets for update to authenticated
using (app.can_write(school_id, 'schedule.update')) with check (app.can_write(school_id, 'schedule.update'));
create policy requirement_targets_delete on teaching_requirement_targets for delete to authenticated
using (app.can_write(school_id, 'schedule.delete'));

alter table teaching_requirement_teachers enable row level security;
alter table teaching_requirement_teachers force  row level security;

create policy requirement_teachers_select on teaching_requirement_teachers for select to authenticated
using (app.can_read(school_id, 'schedule.view'));
create policy requirement_teachers_insert on teaching_requirement_teachers for insert to authenticated
with check (app.can_write(school_id, 'schedule.create'));
create policy requirement_teachers_update on teaching_requirement_teachers for update to authenticated
using (app.can_write(school_id, 'schedule.update')) with check (app.can_write(school_id, 'schedule.update'));
create policy requirement_teachers_delete on teaching_requirement_teachers for delete to authenticated
using (app.can_write(school_id, 'schedule.delete'));

grant select, insert, update, delete on
  teaching_requirements, teaching_requirement_targets, teaching_requirement_teachers
to authenticated;
