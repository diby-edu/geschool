-- =============================================================================
-- 0071 — Discipline et sanctions
-- =============================================================================
--
-- Un incident est SIGNALÉ (par un enseignant, un surveillant, la direction),
-- puis la direction DÉCIDE d'une sanction — ou n'en décide aucune. Les deux
-- gestes sont distincts : celui qui constate n'est pas celui qui punit.
--
-- Rien n'est codé en dur : chaque établissement définit ses propres motifs
-- d'incident et ses propres sanctions, avec leurs libellés. Une école qui note
-- le comportement sur des points met des points ; une autre les laisse à zéro
-- et n'en parle jamais.
--
--   discipline_incident_types  retard, bagarre, tricherie, insolence…
--   discipline_sanction_types  avertissement, exclusion, travail d'intérêt…
--   discipline_incidents       ce qui s'est passé, pour un élève, à une date
--   discipline_sanctions       ce qui a été décidé, par qui, sur quelle période

-- -----------------------------------------------------------------------------
-- 1. Les listes de l'établissement
-- -----------------------------------------------------------------------------

create table if not exists discipline_incident_types (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  code       text not null,
  name       text not null,
  -- Barème de comportement : 0 quand l'école n'en utilise pas.
  points     integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (school_id, code),
  constraint discipline_incident_types_points check (points >= 0 and points <= 100)
);

create index if not exists discipline_incident_types_school_idx on discipline_incident_types (school_id, is_active);

create table if not exists discipline_sanction_types (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  code        text not null,
  name        text not null,
  -- Une exclusion temporaire court sur des jours ; un avertissement, non.
  needs_dates boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (school_id, code)
);

create index if not exists discipline_sanction_types_school_idx on discipline_sanction_types (school_id, is_active);

-- -----------------------------------------------------------------------------
-- 2. Les faits
-- -----------------------------------------------------------------------------

create type discipline_incident_status as enum ('OPEN', 'CLOSED');
create type discipline_sanction_status as enum ('PLANNED', 'DONE', 'CANCELLED');

create table if not exists discipline_incidents (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  -- Classe au moment des faits : l'élève peut changer de classe ensuite.
  class_id         uuid references classes(id) on delete set null,
  incident_type_id uuid not null references discipline_incident_types(id) on delete restrict,

  occurred_on      date not null,
  occurred_at      time,
  description      text not null default '',
  status           discipline_incident_status not null default 'OPEN',

  reported_by      uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint discipline_incidents_description check (length(description) <= 2000)
);

create index if not exists discipline_incidents_student_idx on discipline_incidents (student_id, occurred_on desc);
create index if not exists discipline_incidents_year_idx on discipline_incidents (school_id, academic_year_id, occurred_on desc);
create index if not exists discipline_incidents_class_idx on discipline_incidents (class_id) where class_id is not null;

create table if not exists discipline_sanctions (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  incident_id      uuid references discipline_incidents(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  sanction_type_id uuid not null references discipline_sanction_types(id) on delete restrict,

  decided_on       date not null default current_date,
  starts_on        date,
  ends_on          date,
  notes            text not null default '',
  status           discipline_sanction_status not null default 'PLANNED',

  decided_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint discipline_sanctions_range check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint discipline_sanctions_notes check (length(notes) <= 2000)
);

create index if not exists discipline_sanctions_student_idx on discipline_sanctions (student_id, decided_on desc);
create index if not exists discipline_sanctions_incident_idx on discipline_sanctions (incident_id) where incident_id is not null;
create index if not exists discipline_sanctions_school_idx on discipline_sanctions (school_id, status);

drop trigger if exists discipline_incident_types_touch on discipline_incident_types;
create trigger discipline_incident_types_touch before update on discipline_incident_types
  for each row execute function app.touch_updated_at();
drop trigger if exists discipline_sanction_types_touch on discipline_sanction_types;
create trigger discipline_sanction_types_touch before update on discipline_sanction_types
  for each row execute function app.touch_updated_at();
drop trigger if exists discipline_incidents_touch on discipline_incidents;
create trigger discipline_incidents_touch before update on discipline_incidents
  for each row execute function app.touch_updated_at();
drop trigger if exists discipline_sanctions_touch on discipline_sanctions;
create trigger discipline_sanctions_touch before update on discipline_sanctions
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Droits
-- -----------------------------------------------------------------------------

insert into permissions (code, module, action, description, is_platform_only)
values
  ('discipline.view',      'discipline', 'view',      'Consulter les incidents et les sanctions', false),
  ('discipline.create',    'discipline', 'create',    'Signaler un incident', false),
  ('discipline.decide',    'discipline', 'decide',    'Prononcer ou lever une sanction', false),
  ('discipline.delete',    'discipline', 'delete',    'Supprimer un incident ou une sanction', false),
  ('discipline.configure', 'discipline', 'configure', 'Definir les motifs d''incident et les sanctions', false)
on conflict (code) do nothing;

-- Direction et administration : tout, y compris les copies propres a chaque
-- etablissement (roles clones par app.ensure_school_roles).
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'::scope_type
from roles r
cross join permissions p
where r.code in ('SCHOOL_ADMIN', 'DIRECTOR')
  and p.code in ('discipline.view', 'discipline.create', 'discipline.decide', 'discipline.delete', 'discipline.configure')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 4. RLS — qui voit quoi
--
-- Un enseignant voit et signale les incidents de SES eleves sans droit
-- particulier (son perimetre est calcule, comme pour les notes et l'appel). Il
-- ne prononce pas de sanction : cela demande `discipline.decide`.
-- -----------------------------------------------------------------------------

alter table discipline_incident_types enable row level security;
alter table discipline_incident_types force  row level security;
alter table discipline_sanction_types enable row level security;
alter table discipline_sanction_types force  row level security;
alter table discipline_incidents enable row level security;
alter table discipline_incidents force  row level security;
alter table discipline_sanctions enable row level security;
alter table discipline_sanctions force  row level security;

-- Les listes : lisibles par tout membre (elles remplissent les menus), ecrites
-- par qui configure la discipline.
create policy discipline_incident_types_select on discipline_incident_types for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy discipline_incident_types_write on discipline_incident_types for all to authenticated
using (app.can_write(school_id, 'discipline.configure'))
with check (app.can_write(school_id, 'discipline.configure'));

create policy discipline_sanction_types_select on discipline_sanction_types for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy discipline_sanction_types_write on discipline_sanction_types for all to authenticated
using (app.can_write(school_id, 'discipline.configure'))
with check (app.can_write(school_id, 'discipline.configure'));

-- Incidents
create policy discipline_incidents_select on discipline_incidents for select to authenticated
using (
  app.can_read(school_id, 'discipline.view')
  or app.teaches_student(student_id)
  or reported_by = app.current_user_id()
);

create policy discipline_incidents_insert on discipline_incidents for insert to authenticated
with check (
  (app.can_write_year(school_id, academic_year_id, 'discipline.create') or app.teaches_student(student_id))
  and app.school_is_writable(school_id)
);

create policy discipline_incidents_update on discipline_incidents for update to authenticated
using (
  app.can_write_year(school_id, academic_year_id, 'discipline.decide')
  or (reported_by = app.current_user_id() and status = 'OPEN')
)
with check (
  app.can_write_year(school_id, academic_year_id, 'discipline.decide')
  or (reported_by = app.current_user_id() and status = 'OPEN')
);

create policy discipline_incidents_delete on discipline_incidents for delete to authenticated
using (app.can_write_year(school_id, academic_year_id, 'discipline.delete'));

-- Sanctions : decidees par la direction, lues par ceux qui voient l'incident.
create policy discipline_sanctions_select on discipline_sanctions for select to authenticated
using (
  app.can_read(school_id, 'discipline.view')
  or app.teaches_student(student_id)
);

create policy discipline_sanctions_insert on discipline_sanctions for insert to authenticated
with check (app.can_write(school_id, 'discipline.decide') and app.school_is_writable(school_id));

create policy discipline_sanctions_update on discipline_sanctions for update to authenticated
using (app.can_write(school_id, 'discipline.decide'))
with check (app.can_write(school_id, 'discipline.decide'));

create policy discipline_sanctions_delete on discipline_sanctions for delete to authenticated
using (app.can_write(school_id, 'discipline.delete'));
