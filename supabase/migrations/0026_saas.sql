-- =============================================================================
-- 0026 — Plans, abonnements, consommation, paiements
-- =============================================================================
--
-- Agnostique du fournisseur de paiement : Mobile Money, virement ou especes
-- saisies par le Super Admin se logent dans le meme schema (Q2 de DECISIONS).

create type billing_period      as enum ('MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_TIME');
create type subscription_status as enum ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
create type usage_metric        as enum ('STUDENTS', 'USERS', 'STORAGE_MB', 'SMS_SENT', 'SCHEDULE_GENERATIONS');
create type payment_method      as enum ('MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CARD', 'OTHER');
create type payment_status      as enum ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED');

-- plans est une table PLATEFORME : pas de school_id.
create table plans (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  description    text not null default '',
  price_amount   numeric(12,2) not null default 0,
  currency       char(3) not null default 'XOF',
  billing_period billing_period not null default 'YEARLY',
  -- Quotas : eleves, utilisateurs, stockage, SMS. Modifiables par le Super
  -- Admin sans toucher au code (§61).
  limits         jsonb not null default '{}'::jsonb,
  features       jsonb not null default '{}'::jsonb,
  is_public      boolean not null default true,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint plans_price_positive check (price_amount >= 0),
  constraint plans_limits_is_object check (jsonb_typeof(limits) = 'object')
);

create trigger plans_touch before update on plans
  for each row execute function app.touch_updated_at();

create table subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references schools(id) on delete cascade,
  plan_id              uuid not null references plans(id) on delete restrict,

  status               subscription_status not null default 'TRIALING',
  started_at           timestamptz not null default now(),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  trial_ends_at        timestamptz,
  cancel_at            timestamptz,
  cancelled_at         timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint subscriptions_period check (
    current_period_end is null or current_period_start is null
    or current_period_end > current_period_start
  )
);

-- Un seul abonnement vivant par etablissement
create unique index subscriptions_active_key
  on subscriptions (school_id) where status in ('TRIALING', 'ACTIVE', 'PAST_DUE');
create index subscriptions_school_idx on subscriptions (school_id, status);

create trigger subscriptions_touch before update on subscriptions
  for each row execute function app.touch_updated_at();

create table subscription_items (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  metric          usage_metric not null,
  quantity        integer not null default 0,
  unit_price      numeric(12,2) not null default 0,

  unique (subscription_id, metric)
);

create index subscription_items_school_idx on subscription_items (school_id);

create table usage_records (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id) on delete cascade,
  metric       usage_metric not null,
  value        numeric(14,2) not null default 0,
  recorded_for date not null default current_date,
  source       text,
  created_at   timestamptz not null default now(),

  unique (school_id, metric, recorded_for)
);

create index usage_records_school_idx on usage_records (school_id, metric, recorded_for desc);

create table payments (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(id) on delete cascade,
  subscription_id    uuid references subscriptions(id) on delete set null,

  amount             numeric(12,2) not null,
  currency           char(3) not null default 'XOF',
  method             payment_method not null default 'MOBILE_MONEY',
  provider           text,
  provider_reference text,
  status             payment_status not null default 'PENDING',

  paid_at            timestamptz,
  recorded_by        uuid references users(id) on delete set null,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint payments_amount_positive check (amount >= 0)
);

create index payments_school_idx on payments (school_id, status, created_at desc);
create unique index payments_provider_ref_key
  on payments (provider, provider_reference)
  where provider is not null and provider_reference is not null;

create trigger payments_touch before update on payments
  for each row execute function app.touch_updated_at();

-- Derogation ponctuelle au plan, decidee par le Super Admin
create table school_features (
  school_id       uuid not null references schools(id) on delete cascade,
  feature_code    text not null,
  is_enabled      boolean not null default true,
  override_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (school_id, feature_code)
);

create trigger school_features_touch before update on school_features
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
--
-- Un etablissement consulte sa facturation, il ne la modifie jamais : toute
-- ecriture est reservee au Super Admin.
-- -----------------------------------------------------------------------------

alter table plans enable row level security;
alter table plans force  row level security;

create policy plans_select on plans for select to authenticated
using (is_public or app.is_platform_admin());
create policy plans_insert on plans for insert to authenticated
with check (app.is_platform_admin());
create policy plans_update on plans for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy plans_delete on plans for delete to authenticated
using (app.is_platform_admin());

alter table subscriptions enable row level security;
alter table subscriptions force  row level security;

create policy subscriptions_select on subscriptions for select to authenticated
using (app.can_read(school_id, 'billing.view'));
create policy subscriptions_insert on subscriptions for insert to authenticated
with check (app.is_platform_admin());
create policy subscriptions_update on subscriptions for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy subscriptions_delete on subscriptions for delete to authenticated
using (app.is_platform_admin());

alter table subscription_items enable row level security;
alter table subscription_items force  row level security;

create policy subscription_items_select on subscription_items for select to authenticated
using (app.can_read(school_id, 'billing.view'));
create policy subscription_items_insert on subscription_items for insert to authenticated
with check (app.is_platform_admin());
create policy subscription_items_update on subscription_items for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy subscription_items_delete on subscription_items for delete to authenticated
using (app.is_platform_admin());

alter table usage_records enable row level security;
alter table usage_records force  row level security;

create policy usage_records_select on usage_records for select to authenticated
using (app.can_read(school_id, 'billing.view'));
create policy usage_records_insert on usage_records for insert to authenticated
with check (app.is_platform_admin());
create policy usage_records_update on usage_records for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy usage_records_delete on usage_records for delete to authenticated
using (app.is_platform_admin());

alter table payments enable row level security;
alter table payments force  row level security;

create policy payments_select on payments for select to authenticated
using (app.can_read(school_id, 'billing.view'));
create policy payments_insert on payments for insert to authenticated
with check (app.is_platform_admin() or app.can_write(school_id, 'billing.manage'));
create policy payments_update on payments for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy payments_delete on payments for delete to authenticated
using (app.is_platform_admin());

alter table school_features enable row level security;
alter table school_features force  row level security;

create policy school_features_select on school_features for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
create policy school_features_insert on school_features for insert to authenticated
with check (app.is_platform_admin());
create policy school_features_update on school_features for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy school_features_delete on school_features for delete to authenticated
using (app.is_platform_admin());

grant select, insert, update, delete on
  plans, subscriptions, subscription_items, usage_records, payments, school_features
to authenticated;
