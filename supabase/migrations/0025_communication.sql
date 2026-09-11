-- =============================================================================
-- 0025 — Notifications et annonces
-- =============================================================================
--
-- ADR-010 : le canal des evenements scolaires est IN_APP en V1, PUSH ensuite.
-- SMS, WHATSAPP et EMAIL restent dans l'enumeration pour l'avenir mais sont
-- desactives par configuration, et aucun code de la V1 ne les emprunte. Le SMS
-- est reserve a la transmission des identifiants (docs/ACCESS_MANAGEMENT.md).

create type notification_channel as enum ('IN_APP', 'PUSH', 'EMAIL', 'SMS', 'WHATSAPP');
create type announcement_status  as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,

  type        text not null,
  title       text not null,
  body        text not null default '',
  data        jsonb not null default '{}'::jsonb,
  entity_type text,
  entity_id   uuid,

  read_at     timestamptz,
  created_at  timestamptz not null default now(),

  constraint notifications_data_is_object check (jsonb_typeof(data) = 'object')
);

-- Index de la cloche de notification : les non lues en premier, par date
create index notifications_inbox_idx
  on notifications (user_id, read_at, created_at desc);
create index notifications_school_idx on notifications (school_id, created_at desc);

create table notification_preferences (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  notification_type text not null,
  channels          notification_channel[] not null default '{IN_APP}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (school_id, user_id, notification_type)
);

create index notification_preferences_user_idx on notification_preferences (user_id);

create trigger notification_preferences_touch before update on notification_preferences
  for each row execute function app.touch_updated_at();

create table announcements (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id) on delete cascade,
  title        text not null,
  body         text not null,
  -- Ciblage : roles, niveaux, classes. Valide par Zod cote application.
  audience     jsonb not null default '{}'::jsonb,
  status       announcement_status not null default 'DRAFT',
  published_at timestamptz,
  expires_at   timestamptz,
  author_id    uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint announcements_audience_is_object check (jsonb_typeof(audience) = 'object')
);

create index announcements_school_idx
  on announcements (school_id, status, published_at desc);

create trigger announcements_touch before update on announcements
  for each row execute function app.touch_updated_at();

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  endpoint   text not null,
  keys       jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now(),

  unique (user_id, endpoint)
);

create index push_subscriptions_school_idx on push_subscriptions (school_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table notifications enable row level security;
alter table notifications force  row level security;

-- Une notification appartient a son destinataire, et a lui seul. Meme un
-- administrateur n'a pas a lire la boite d'un tiers.
create policy notifications_select on notifications for select to authenticated
using (user_id = auth.uid() or app.is_platform_admin());

-- Ecrites par le serveur : une notification que son destinataire pourrait
-- fabriquer ne vaudrait rien.
create policy notifications_insert on notifications for insert to authenticated
with check (app.is_platform_admin());

-- Le destinataire ne peut que la marquer comme lue
create policy notifications_update on notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_delete on notifications for delete to authenticated
using (user_id = auth.uid() or app.is_platform_admin());

alter table notification_preferences enable row level security;
alter table notification_preferences force  row level security;

create policy notif_prefs_select on notification_preferences for select to authenticated
using (user_id = auth.uid() or app.is_platform_admin());
create policy notif_prefs_insert on notification_preferences for insert to authenticated
with check (user_id = auth.uid());
create policy notif_prefs_update on notification_preferences for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_prefs_delete on notification_preferences for delete to authenticated
using (user_id = auth.uid());

alter table announcements enable row level security;
alter table announcements force  row level security;

-- Le ciblage fin (roles, niveaux, classes) est applique cote serveur a la
-- projection. La RLS garantit deja l'essentiel : appartenance a
-- l'etablissement, et annonce effectivement publiee.
create policy announcements_select on announcements for select to authenticated
using (
  app.can_read(school_id, 'announcements.view')
  or (app.is_member_of(school_id)
      and status = 'PUBLISHED'
      and (expires_at is null or expires_at > now()))
);

create policy announcements_insert on announcements for insert to authenticated
with check (app.can_write(school_id, 'announcements.create'));
create policy announcements_update on announcements for update to authenticated
using (app.can_write(school_id, 'announcements.publish'))
with check (app.can_write(school_id, 'announcements.publish'));
create policy announcements_delete on announcements for delete to authenticated
using (app.can_write(school_id, 'announcements.publish'));

alter table push_subscriptions enable row level security;
alter table push_subscriptions force  row level security;

create policy push_subs_select on push_subscriptions for select to authenticated
using (user_id = auth.uid() or app.is_platform_admin());
create policy push_subs_insert on push_subscriptions for insert to authenticated
with check (user_id = auth.uid());
create policy push_subs_update on push_subscriptions for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subs_delete on push_subscriptions for delete to authenticated
using (user_id = auth.uid() or app.is_platform_admin());

grant select, insert, update, delete on
  notifications, notification_preferences, announcements, push_subscriptions
to authenticated;
