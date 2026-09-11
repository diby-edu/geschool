-- =============================================================================
-- 0002 — Etablissements, parametrage, administrateurs plateforme
-- =============================================================================

create type school_type as enum (
  'PRIMARY', 'SECONDARY', 'HIGH_SCHOOL', 'TECHNICAL', 'MIXED', 'OTHER'
);

create type school_status as enum ('PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

create type settings_namespace as enum (
  'academic', 'grading', 'attendance', 'schedule', 'reporting', 'notifications', 'access'
);

create type branding_template_kind as enum (
  'REPORT_CARD', 'CERTIFICATE', 'LIST', 'SCHEDULE', 'TRANSCRIPT', 'BADGE'
);

-- -----------------------------------------------------------------------------
-- schools
-- -----------------------------------------------------------------------------

create table schools (
  id                  uuid primary key default gen_random_uuid(),

  -- Segment d'URL : /e/{slug}/... (ADR-003). Immuable apres creation, des liens
  -- et des documents imprimes le referencent.
  slug                text not null,

  name                text not null,
  short_name          text,
  school_type         school_type not null default 'SECONDARY',
  status              school_status not null default 'PENDING',

  logo_url            text,
  favicon_url         text,
  primary_color       text,
  secondary_color     text,

  address             text,
  city                text,
  region              text,
  country_code        char(2) not null default 'CI',
  phone_e164          text,
  email               text,
  website             text,

  director_name       text,
  registration_number text,

  currency            char(3) not null default 'XOF',
  locale              text not null default 'fr-CI',
  timezone            text not null default 'Africa/Abidjan',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint schools_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  constraint schools_primary_color_hex check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint schools_secondary_color_hex check (secondary_color is null or secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint schools_country_upper check (country_code = upper(country_code)),
  constraint schools_currency_upper check (currency = upper(currency)),
  constraint schools_phone_e164 check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);

create unique index schools_slug_key on schools (lower(slug));
create index schools_status_idx on schools (status);

create trigger schools_touch before update on schools
  for each row execute function app.touch_updated_at();

comment on column schools.slug is
  'Segment d''URL. Designe l''etablissement, ne l''autorise jamais : l''appartenance est verifiee separement.';

-- -----------------------------------------------------------------------------
-- school_settings — configuration par domaine (ADR-012)
--
-- Les valeurs par defaut vivent dans le code (src/config/defaults/). La base ne
-- stocke que les ecarts. Le jsonb est valide par un schema Zod a l'ecriture :
-- ce n'est pas un fourre-tout non type.
-- -----------------------------------------------------------------------------

create table school_settings (
  school_id   uuid not null references schools(id) on delete cascade,
  namespace   settings_namespace not null,
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,

  primary key (school_id, namespace),
  constraint school_settings_is_object check (jsonb_typeof(settings) = 'object')
);

create trigger school_settings_touch before update on school_settings
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- school_branding_templates — modeles PDF par etablissement
-- -----------------------------------------------------------------------------

create table school_branding_templates (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  kind        branding_template_kind not null,
  name        text not null,
  layout      jsonb not null default '{}'::jsonb,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index school_branding_templates_school_idx
  on school_branding_templates (school_id, kind);

-- Un seul modele par defaut et par type
create unique index school_branding_templates_default_key
  on school_branding_templates (school_id, kind) where is_default;

create trigger school_branding_templates_touch before update on school_branding_templates
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- platform_admins — Super Admin (ADR-007)
--
-- Ce n'est pas un role d'etablissement : un Super Admin n'a pas d'appartenance.
-- Acces complet en lecture et en ecriture sur tous les etablissements, MFA
-- obligatoire, et journalisation integrale de ses actions.
-- -----------------------------------------------------------------------------

create table platform_admins (
  user_id     uuid primary key,
  is_active   boolean not null default true,
  granted_by  uuid,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  note        text,

  constraint platform_admins_revoked_consistency
    check ((revoked_at is null) or (is_active = false))
);

comment on table platform_admins is
  'Super Admins plateforme. L''attribution se fait par migration ou par un autre Super Admin, jamais depuis l''interface d''un etablissement.';
