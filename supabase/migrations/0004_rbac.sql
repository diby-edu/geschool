-- =============================================================================
-- 0004 — RBAC : roles, permissions atomiques, derogations de perimetre
-- =============================================================================
--
-- Voir docs/RBAC.md. Principe : une action est autorisee si et seulement si la
-- permission existe ET que l'objet vise tombe dans le perimetre. Jamais de
-- comparaison de chaine du type `role = 'admin'` dans le code.

create type role_level as enum ('PLATFORM', 'SCHOOL');

-- -----------------------------------------------------------------------------
-- permissions — catalogue global, non tenant
-- -----------------------------------------------------------------------------

create table permissions (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  module           text not null,
  action           text not null,
  description      text not null default '',
  is_platform_only boolean not null default false,
  created_at       timestamptz not null default now(),

  constraint permissions_code_format check (code ~ '^[a-z_]+(\.[a-z_]+)+$')
);

create index permissions_module_idx on permissions (module);

-- -----------------------------------------------------------------------------
-- roles
--
-- school_id NULL = modele systeme partage par tous les etablissements.
-- Un etablissement peut cloner un role systeme pour en ajuster les permissions
-- sans toucher au modele (docs/RBAC.md §1).
-- -----------------------------------------------------------------------------

create table roles (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references schools(id) on delete cascade,
  code        text not null,
  name        text not null,
  description text not null default '',
  is_system   boolean not null default false,
  level       role_level not null default 'SCHOOL',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint roles_code_format check (code ~ '^[A-Z][A-Z0-9_]*$'),
  -- Un role systeme n'appartient a aucun etablissement, et reciproquement
  constraint roles_system_is_global check ((is_system and school_id is null) or not is_system)
);

-- school_id etant nullable, l'unicite passe par coalesce : sans cela, deux
-- roles systeme de meme code pourraient coexister (NULL <> NULL en SQL).
create unique index roles_code_key
  on roles (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
create index roles_school_idx on roles (school_id);

create trigger roles_touch before update on roles
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- role_permissions
-- -----------------------------------------------------------------------------

create table role_permissions (
  role_id       uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  default_scope scope_type not null default 'SCHOOL',
  primary key (role_id, permission_id)
);

create index role_permissions_permission_idx on role_permissions (permission_id);

-- -----------------------------------------------------------------------------
-- membership_roles — un membre peut cumuler des roles
-- (un censeur qui enseigne porte CENSOR et TEACHER)
-- -----------------------------------------------------------------------------

create table membership_roles (
  membership_id uuid not null references school_memberships(id) on delete cascade,
  role_id       uuid not null references roles(id) on delete cascade,
  granted_at    timestamptz not null default now(),
  granted_by    uuid references users(id) on delete set null,
  primary key (membership_id, role_id)
);

create index membership_roles_role_idx on membership_roles (role_id);

-- -----------------------------------------------------------------------------
-- membership_scope_grants — derogations explicites de perimetre
--
-- Le perimetre principal est DERIVE du metier : un enseignant voit ses classes
-- via teaching_assignments, un parent voit ses enfants via student_guardians.
-- Cette table ne sert qu'a ce que le metier ne dit pas — un censeur responsable
-- des seuls niveaux 6e et 5e, par exemple.
-- -----------------------------------------------------------------------------

create table membership_scope_grants (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references school_memberships(id) on delete cascade,
  -- NULL = s'applique a toutes les permissions du membre
  permission_id uuid references permissions(id) on delete cascade,
  scope_type    scope_type not null,
  scope_id      uuid,
  created_at    timestamptz not null default now(),
  created_by    uuid references users(id) on delete set null,

  -- Un perimetre cible doit designer quelque chose ; SCHOOL et GLOBAL non
  constraint membership_scope_grants_target check (
    (scope_type in ('SCHOOL', 'GLOBAL', 'SELF', 'CHILDREN') and scope_id is null)
    or (scope_type in ('CYCLE', 'LEVEL', 'CLASS', 'GROUP', 'SUBJECT') and scope_id is not null)
  )
);

create index membership_scope_grants_membership_idx
  on membership_scope_grants (membership_id);
create unique index membership_scope_grants_key
  on membership_scope_grants (
    membership_id,
    coalesce(permission_id, '00000000-0000-0000-0000-000000000000'::uuid),
    scope_type,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
