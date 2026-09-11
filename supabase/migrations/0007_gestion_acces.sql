-- =============================================================================
-- 0007 — Gestion des acces : comptes, identifiants, transmission
-- =============================================================================
--
-- Voir docs/ACCESS_MANAGEMENT.md. Aucun secret n'est stocke ici, nulle part :
-- le mot de passe temporaire est genere au moment de l'envoi et n'existe qu'en
-- memoire (ADR-006).

-- -----------------------------------------------------------------------------
-- Correctif : proteger la table du runner de migrations
--
-- _migrations est creee par scripts/migrate.mjs et vit dans public, donc
-- PostgREST l'exposerait aux utilisateurs authentifies. Elle ne revele rien de
-- critique, mais l'historique des migrations n'a pas a etre public.
-- RLS activee sans aucune policy = refus total, sauf pour service_role.
-- -----------------------------------------------------------------------------

alter table _migrations enable row level security;
alter table _migrations force  row level security;
revoke all on _migrations from authenticated, anon;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------

create type account_subject_kind as enum ('STAFF', 'TEACHER', 'GUARDIAN', 'STUDENT');
create type login_kind           as enum ('EMAIL', 'PHONE', 'MATRICULE');
create type activation_status    as enum ('NOT_ACTIVATED', 'ACTIVATED');

create type delivery_reason  as enum ('INITIAL', 'RESET', 'RESEND');
create type delivery_channel as enum ('SMS', 'WHATSAPP', 'EMAIL', 'PRINT');
create type delivery_status  as enum (
  'PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED'
);

create type access_event_type as enum (
  'ACCOUNT_CREATED',
  'CREDENTIALS_QUEUED',
  'CREDENTIALS_SENT',
  'CREDENTIALS_DELIVERED',
  'CREDENTIALS_FAILED',
  'ACCOUNT_ACTIVATED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_REACTIVATED',
  'PHONE_CHANGED'
);

-- -----------------------------------------------------------------------------
-- account_access — cycle de vie d'un compte DANS un etablissement
--
-- Les trois dimensions restent separees (additif §24) : un compte peut etre
-- ACTIVE avec un envoi FAILED, ou NOT_ACTIVATED avec un envoi DELIVERED.
-- Les fusionner rendrait le module de gestion des acces illisible.
-- -----------------------------------------------------------------------------

create table account_access (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null references schools(id) on delete cascade,
  user_id                 uuid not null references users(id) on delete cascade,

  subject_kind            account_subject_kind not null,
  login_kind              login_kind not null,
  -- Telephone E.164, matricule, ou email selon login_kind
  login_identifier        text not null,

  account_status          account_status not null default 'CREATED',
  activation_status       activation_status not null default 'NOT_ACTIVATED',
  must_change_password    boolean not null default true,

  activated_at            timestamptz,
  last_password_change_at timestamptz,
  last_reset_at           timestamptz,
  reset_count             integer not null default 0,
  delivery_count          integer not null default 0,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references users(id) on delete set null,

  unique (school_id, user_id),
  constraint account_access_identifier_not_blank check (btrim(login_identifier) <> ''),
  -- Coherence : un compte active a forcement une date d'activation
  constraint account_access_activation_consistency check (
    (activation_status = 'ACTIVATED' and activated_at is not null)
    or (activation_status = 'NOT_ACTIVATED' and activated_at is null)
  )
);

-- L'exigence exacte de l'additif §5, rendue possible par l'email synthetique
-- (ADR-005) : Supabase Auth impose une unicite globale du telephone, nous
-- imposons la notre, par etablissement.
create unique index account_access_identifier_key
  on account_access (school_id, lower(login_identifier));

create index account_access_school_status_idx
  on account_access (school_id, subject_kind, activation_status);
create index account_access_user_idx on account_access (user_id);

create trigger account_access_touch before update on account_access
  for each row execute function app.touch_updated_at();

comment on table account_access is
  'Cycle de vie des comptes par etablissement. Ne contient AUCUN secret : le mot de passe temporaire est genere a l''envoi (ADR-006).';

-- -----------------------------------------------------------------------------
-- credential_delivery_batches — envoi groupe (additif §18)
-- -----------------------------------------------------------------------------

create table credential_delivery_batches (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  requested_by  uuid references users(id) on delete set null,
  total         integer not null default 0,
  sent          integer not null default 0,
  failed        integer not null default 0,
  status        delivery_status not null default 'PENDING',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index credential_delivery_batches_school_idx
  on credential_delivery_batches (school_id, created_at desc);

create trigger credential_delivery_batches_touch before update on credential_delivery_batches
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- credential_deliveries — file d'envoi des identifiants
--
-- Ne contient JAMAIS le mot de passe. Le worker le genere au traitement, met a
-- jour Supabase Auth, rend le message, l'envoie, puis le secret sort de la
-- memoire sans avoir ete ecrit nulle part.
-- -----------------------------------------------------------------------------

create table credential_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,
  batch_id            uuid references credential_delivery_batches(id) on delete set null,

  reason              delivery_reason not null default 'INITIAL',
  channel             delivery_channel not null default 'SMS',
  -- Destinataire fige au moment de la demande : si le numero change entre la
  -- mise en file et l'envoi, le secret ne doit pas partir au nouveau numero.
  recipient           text not null,

  status              delivery_status not null default 'PENDING',
  attempts            integer not null default 0,
  max_attempts        integer not null default 5,
  last_attempt_at     timestamptz,
  next_attempt_at     timestamptz not null default now(),

  error_code          text,
  error_message       text,
  provider            text,
  provider_message_id text,

  sent_at             timestamptz,
  delivered_at        timestamptz,

  -- Deterministe : sha256(user_id + reason + jour). Deux clics, un double
  -- envoi de formulaire ou une synchronisation rejouee ne produisent qu'un SMS.
  idempotency_key     text not null,

  requested_by        uuid references users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (school_id, idempotency_key),
  constraint credential_deliveries_attempts_positive check (attempts >= 0)
);

-- Index du worker : recupere le prochain envoi du a traiter
create index credential_deliveries_queue_idx
  on credential_deliveries (status, next_attempt_at)
  where status in ('PENDING', 'FAILED');

create index credential_deliveries_school_idx
  on credential_deliveries (school_id, status, created_at desc);
create index credential_deliveries_user_idx on credential_deliveries (user_id);
create index credential_deliveries_batch_idx
  on credential_deliveries (batch_id) where batch_id is not null;

create trigger credential_deliveries_touch before update on credential_deliveries
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- access_events — historique par compte (additif §23)
-- Aucun mot de passe, present ou passe, n'y figure jamais.
-- -----------------------------------------------------------------------------

create table access_events (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  event_type  access_event_type not null,
  actor_id    uuid references users(id) on delete set null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  constraint access_events_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create index access_events_user_idx on access_events (user_id, created_at desc);
create index access_events_school_idx on access_events (school_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS
--
-- Un utilisateur voit toujours son propre acces et son propre historique :
-- c'est ce qui permet a l'ecran de premiere connexion de fonctionner avant
-- qu'aucune permission ne lui soit accordee.
-- -----------------------------------------------------------------------------

alter table account_access enable row level security;
alter table account_access force  row level security;

create policy account_access_select on account_access for select to authenticated
using (
  user_id = auth.uid()
  or app.can_read(school_id, 'access_accounts.view')
);

create policy account_access_insert on account_access for insert to authenticated
with check (app.can_write(school_id, 'access_accounts.send'));

create policy account_access_update on account_access for update to authenticated
using (user_id = auth.uid() or app.can_write(school_id, 'access_accounts.reset'))
with check (user_id = auth.uid() or app.can_write(school_id, 'access_accounts.reset'));

create policy account_access_delete on account_access for delete to authenticated
using (app.can_write(school_id, 'access_accounts.disable'));

alter table credential_delivery_batches enable row level security;
alter table credential_delivery_batches force  row level security;

create policy delivery_batches_select on credential_delivery_batches for select to authenticated
using (app.can_read(school_id, 'access_accounts.view'));

create policy delivery_batches_insert on credential_delivery_batches for insert to authenticated
with check (app.can_write(school_id, 'access_accounts.bulk_send'));

create policy delivery_batches_update on credential_delivery_batches for update to authenticated
using (app.can_write(school_id, 'access_accounts.bulk_send'))
with check (app.can_write(school_id, 'access_accounts.bulk_send'));

create policy delivery_batches_delete on credential_delivery_batches for delete to authenticated
using (app.is_platform_admin());

alter table credential_deliveries enable row level security;
alter table credential_deliveries force  row level security;

create policy deliveries_select on credential_deliveries for select to authenticated
using (app.can_read(school_id, 'access_accounts.view'));

create policy deliveries_insert on credential_deliveries for insert to authenticated
with check (
  app.can_write(school_id, 'access_accounts.send')
  or app.can_write(school_id, 'access_accounts.resend')
);

create policy deliveries_update on credential_deliveries for update to authenticated
using (app.can_write(school_id, 'access_accounts.resend'))
with check (app.can_write(school_id, 'access_accounts.resend'));

create policy deliveries_delete on credential_deliveries for delete to authenticated
using (app.is_platform_admin());

alter table access_events enable row level security;
alter table access_events force  row level security;

create policy access_events_select on access_events for select to authenticated
using (
  user_id = auth.uid()
  or app.can_read(school_id, 'access_accounts.view_history')
);

-- L'historique est ecrit par le serveur (service_role), jamais par un client :
-- une trace d'audit modifiable par son sujet ne vaut rien.
create policy access_events_insert on access_events for insert to authenticated
with check (app.is_platform_admin());

create policy access_events_update on access_events for update to authenticated
using (false) with check (false);

create policy access_events_delete on access_events for delete to authenticated
using (false);

grant select, insert, update, delete on
  account_access, credential_delivery_batches, credential_deliveries, access_events
to authenticated;
