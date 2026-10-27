-- =============================================================================
-- 0148 — Communiquer avec les écoles (lot 5 du Super Admin)
-- =============================================================================
--
-- Décidé le 2026-10-26 (maquette docs/maquettes/super-admin-messages.html) :
--
-- 1. La plateforme écrit aux écoles. Un message (titre, texte, « information »
--    ou « important », affiché jusqu'à une date) part vers des écoles choisies
--    (toutes, en essai, abonnées, expirées, ou une liste) et, dans chaque
--    école, vers qui on coche à chaque fois : direction, tout le personnel,
--    enseignants, parents. En option, un SMS au fondateur.
--    Livraison : une notification par personne (table notifications, la
--    cloche). Lu = notification lue. Un message « important » reste en bandeau
--    tant que la personne n'a pas cliqué « J'ai compris ».
--
-- 2. Les écoles écrivent à la plateforme (« Contacter la plateforme »). Droit
--    `support.contact` : direction et informaticien par défaut. Une demande a
--    un fil de messages ; la réponse de la plateforme revient dans la cloche.
--
-- Écritures : par le serveur (client d'administration), APRÈS le contrôle du
-- droit. Ici, seulement les lectures.
-- =============================================================================

create table if not exists platform_messages (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (btrim(title) <> '' and length(title) <= 140),
  body             text not null check (length(body) <= 2000),
  importance       text not null default 'INFO' check (importance in ('INFO', 'IMPORTANT')),
  show_until       date,
  target           text not null check (target in ('ALL', 'TRIALING', 'PAID', 'EXPIRED', 'SCHOOLS')),
  school_ids       uuid[] not null default '{}',
  audience         text[] not null check (cardinality(audience) > 0),
  sms_to_founder   boolean not null default false,
  schools_count    integer not null default 0,
  recipients_count integer not null default 0,
  sms_sent         integer not null default 0,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);

alter table platform_messages enable row level security;
alter table platform_messages force row level security;
create policy platform_messages_admin on platform_messages for all to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Les notifications d'un message, pour compter les lectures.
create index if not exists notifications_entity_idx on notifications (entity_id) where entity_id is not null;

create table if not exists platform_requests (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  author_id   uuid references users(id) on delete set null,
  subject     text not null check (btrim(subject) <> '' and length(subject) <= 140),
  status      text not null default 'OPEN' check (status in ('OPEN', 'ANSWERED', 'CLOSED')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists platform_requests_school_idx on platform_requests (school_id, updated_at desc);
create index if not exists platform_requests_status_idx on platform_requests (status, updated_at desc);

create table if not exists platform_request_messages (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references platform_requests(id) on delete cascade,
  author_id      uuid references users(id) on delete set null,
  from_platform  boolean not null default false,
  body           text not null check (btrim(body) <> '' and length(body) <= 4000),
  created_at     timestamptz not null default now()
);
create index if not exists platform_request_messages_request_idx on platform_request_messages (request_id, created_at);

insert into permissions (code, module, action, description, is_platform_only) values
  ('support.contact', 'support', 'contact', 'Ecrire a la plateforme et lire les reponses', false)
on conflict (code) do nothing;

with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on r.code = any (array['SCHOOL_ADMIN', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'CENSOR', 'IT_ADMIN'])
  where p.code = 'support.contact'
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;

-- Lecture : la plateforme, ou dans l'école ceux qui ont le droit (même pendant
-- une coupure d'abonnement : on doit pouvoir écrire à la plateforme).
alter table platform_requests enable row level security;
alter table platform_requests force row level security;
create policy platform_requests_select on platform_requests for select to authenticated
using (
  app.is_platform_admin()
  or (app.is_member_of(school_id) and app.has_permission(school_id, 'support.contact'))
);

alter table platform_request_messages enable row level security;
alter table platform_request_messages force row level security;
create policy platform_request_messages_select on platform_request_messages for select to authenticated
using (
  exists (
    select 1 from platform_requests r
    where r.id = platform_request_messages.request_id
      and (app.is_platform_admin() or (app.is_member_of(r.school_id) and app.has_permission(r.school_id, 'support.contact')))
  )
);
