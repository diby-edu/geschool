-- =============================================================================
-- 0027 — Journal d'audit et synchronisation hors ligne
-- =============================================================================

create type sync_operation_status as enum ('RECEIVED', 'APPLIED', 'REJECTED', 'CONFLICT');

-- -----------------------------------------------------------------------------
-- audit_logs
--
-- Ecrit exclusivement par le serveur. Un journal que son sujet pourrait
-- modifier ou effacer ne vaut rien : les policies d'ecriture, de modification
-- et de suppression refusent tout le monde, service_role compris dans la
-- mesure ou il passe par le code applicatif dedie.
--
-- Les champs sensibles sont masques A L'ECRITURE par une liste de refus dans
-- src/lib/audit : aucun mot de passe, aucun secret ne doit atteindre `before`
-- ou `after` (ADR-006).
-- -----------------------------------------------------------------------------

create table audit_logs (
  id                      uuid primary key default gen_random_uuid(),
  -- Nullable : une action plateforme n'appartient a aucun etablissement
  school_id               uuid references schools(id) on delete set null,

  actor_user_id           uuid references users(id) on delete set null,
  actor_is_platform_admin boolean not null default false,
  actor_role              text,

  action                  text not null,
  module                  text not null,
  entity_type             text,
  entity_id               uuid,

  before                  jsonb,
  after                   jsonb,

  ip                      inet,
  user_agent              text,
  request_id              text,

  created_at              timestamptz not null default now()
);

create index audit_logs_school_idx on audit_logs (school_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on audit_logs (actor_user_id, created_at desc);
-- Toutes les actions de la plateforme sur les donnees d'un etablissement,
-- exigees par ADR-007 comme contrepartie de l'acces total du Super Admin.
create index audit_logs_platform_idx
  on audit_logs (created_at desc) where actor_is_platform_admin;

comment on table audit_logs is
  'Journal immuable. Partitionnement mensuel a introduire des que le volume l''exige.';

-- -----------------------------------------------------------------------------
-- sync_operations — la cle de toute l'idempotence hors ligne (ADR-009)
--
-- UNIQUE (school_id, client_operation_id) : le serveur reconnait une operation
-- deja vue et renvoie son resultat memorise au lieu de la rejouer. Sans cela,
-- une synchronisation relancee creerait des doublons — et elle SERA relancee.
-- -----------------------------------------------------------------------------

create table sync_operations (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,

  -- UUID genere sur l'appareil AU MOMENT DE LA SAISIE, jamais a l'envoi
  client_operation_id uuid not null,
  operation_type      text not null,
  payload             jsonb not null default '{}'::jsonb,

  status              sync_operation_status not null default 'RECEIVED',
  result              jsonb,
  error               jsonb,

  received_at         timestamptz not null default now(),
  applied_at          timestamptz,

  unique (school_id, client_operation_id),
  constraint sync_operations_payload_is_object check (jsonb_typeof(payload) = 'object')
);

create index sync_operations_user_idx on sync_operations (user_id, received_at desc);
create index sync_operations_pending_idx
  on sync_operations (school_id, status) where status = 'RECEIVED';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table audit_logs enable row level security;
alter table audit_logs force  row level security;

create policy audit_logs_select on audit_logs for select to authenticated
using (
  app.is_platform_admin()
  or (school_id is not null and app.can_read(school_id, 'audit.view'))
);

-- Immuable pour tout client. Seul le code serveur dedie ecrit, via service_role.
create policy audit_logs_insert on audit_logs for insert to authenticated
with check (false);
create policy audit_logs_update on audit_logs for update to authenticated
using (false) with check (false);
create policy audit_logs_delete on audit_logs for delete to authenticated
using (false);

alter table sync_operations enable row level security;
alter table sync_operations force  row level security;

-- Un utilisateur suit ses propres operations : c'est ce qui alimente
-- l'indicateur « 3 operations en attente » de l'interface.
create policy sync_operations_select on sync_operations for select to authenticated
using (user_id = auth.uid() or app.is_platform_admin());

-- L'application des operations passe par l'endpoint serveur, qui verifie les
-- quatre barrieres. Le client ne peut pas inserer directement : il contournerait
-- la deduplication et le controle de perimetre.
create policy sync_operations_insert on sync_operations for insert to authenticated
with check (false);
create policy sync_operations_update on sync_operations for update to authenticated
using (false) with check (false);
create policy sync_operations_delete on sync_operations for delete to authenticated
using (app.is_platform_admin());

grant select on audit_logs, sync_operations to authenticated;
grant insert, update, delete on audit_logs, sync_operations to authenticated;
