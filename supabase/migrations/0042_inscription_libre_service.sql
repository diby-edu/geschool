-- =============================================================================
-- 0042 — Inscription en libre-service des etablissements
-- =============================================================================
--
-- Un directeur peut desormais creer lui-meme son etablissement (wizard public
-- /inscription), sans passer par le Super Admin. La creation elle-meme se fait
-- via le client service_role (src/services/onboarding.ts) : aucune policy
-- d'ECRITURE n'est assouplie ici, ni sur schools ni sur les tables de comptes.
--
-- Le modele de facturation passe d'un forfait unique par ecole (plans/
-- subscriptions) a un choix de modules independants : Gestion scolaire et
-- notes (200 000 F/an), Appel numerique (100 000 F/an), au moins un requis.
-- L'Espace Parent est un simple interrupteur gratuit pour l'ecole (chaque
-- parent paiera lui-meme plus tard, hors perimetre de cette migration).

-- -----------------------------------------------------------------------------
-- 1. schools — nouveaux champs du wizard
-- -----------------------------------------------------------------------------

alter table schools add column neighborhood text;
alter table schools add column education_tracks text[] not null default '{}';
alter table schools add column parent_portal_enabled boolean not null default false;

alter table schools add constraint schools_education_tracks_valid check (
  education_tracks <@ '{GENERAL,TECHNIQUE,PROFESSIONNEL}'::text[]
  and array_length(education_tracks, 1) >= 1
);

comment on column schools.registration_number is
  'Code officiel de l''etablissement (Ministere), ou un code provisoire '
  '(prefixe PROVISOIRE-) genere a l''inscription si l''ecole ne l''a pas encore.';

-- -----------------------------------------------------------------------------
-- 2. modules — catalogue plateforme (meme forme que plans)
-- -----------------------------------------------------------------------------

create table modules (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  description    text not null default '',
  price_amount   numeric(12,2) not null default 0,
  currency       char(3) not null default 'XOF',
  billing_period billing_period not null default 'YEARLY',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint modules_price_positive check (price_amount >= 0)
);

create trigger modules_touch before update on modules
  for each row execute function app.touch_updated_at();

insert into modules (code, name, description, price_amount, billing_period) values
  ('SCOL',  'Gestion scolaire et notes', 'Eleves, enseignants, classes, salles, emploi du temps, notes et bulletins.', 200000, 'YEARLY'),
  ('APPEL', 'Appel numerique',           'Presence prise depuis le telephone de l''enseignant, sans papier.',        100000, 'YEARLY')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 3. subscriptions — a la carte : plan_id devient optionnel
-- -----------------------------------------------------------------------------

alter table subscriptions alter column plan_id drop not null;

create table subscription_modules (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  module_id       uuid not null references modules(id) on delete restrict,

  unique (subscription_id, module_id)
);

create index subscription_modules_school_idx on subscription_modules (school_id);

-- -----------------------------------------------------------------------------
-- 4. onboarding_signup_attempts — limite anti-abus, service_role uniquement
-- -----------------------------------------------------------------------------

create table onboarding_signup_attempts (
  id         uuid primary key default gen_random_uuid(),
  ip_address text not null,
  created_at timestamptz not null default now()
);

create index onboarding_signup_attempts_ip_idx on onboarding_signup_attempts (ip_address, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table modules enable row level security;
alter table modules force  row level security;

create policy modules_select on modules for select to authenticated
using (is_active or app.is_platform_admin());
create policy modules_insert on modules for insert to authenticated
with check (app.is_platform_admin());
create policy modules_update on modules for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy modules_delete on modules for delete to authenticated
using (app.is_platform_admin());

alter table subscription_modules enable row level security;
alter table subscription_modules force  row level security;

create policy subscription_modules_select on subscription_modules for select to authenticated
using (app.can_read(school_id, 'billing.view'));
create policy subscription_modules_insert on subscription_modules for insert to authenticated
with check (app.is_platform_admin());
create policy subscription_modules_update on subscription_modules for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy subscription_modules_delete on subscription_modules for delete to authenticated
using (app.is_platform_admin());

-- Table de bookkeeping interne : RLS activee et forcee, aucun acces pour
-- authenticated/anon (meme esprit que audit_logs) — seul service_role
-- (utilise par src/services/onboarding.ts) la lit et l'ecrit.
alter table onboarding_signup_attempts enable row level security;
alter table onboarding_signup_attempts force  row level security;

create policy onboarding_signup_attempts_none on onboarding_signup_attempts
for all to authenticated using (false) with check (false);

grant select, insert, update, delete on modules, subscription_modules to authenticated;
