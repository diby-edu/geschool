-- =============================================================================
-- 0089 — Le journal des SMS
--
-- Jusqu'ici, un SMS partait et on ne savait plus rien : ni s'il etait arrive,
-- ni combien il avait coute, ni pourquoi il avait echoue. Pour un canal qui
-- porte les identifiants de connexion — et que l'on paie a l'unite — c'est
-- insuffisant.
--
-- Ce que la table retient :
--   * le message, le numero, le nom d'expediteur reellement utilise ;
--   * l'identifiant rendu par l'operateur, pour interroger l'etat plus tard ;
--   * le NOMBRE DE SMS factures (`parts`) et le cout, car un seul caractere
--     hors alphabet GSM fait passer un message de 1 a 2 SMS ;
--   * l'echec, avec sa cause, et s'il est definitif ou non.
--
-- Le contenu est conserve : il contient des codes provisoires, jamais de mot
-- de passe definitif (ADR-006), et sans lui on ne pourrait pas verifier ce qui
-- a ete envoye a une famille qui conteste.
-- =============================================================================

create type sms_status as enum ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

create table sms_messages (
  id                  uuid primary key default gen_random_uuid(),
  -- Nul pour un envoi de la plateforme elle-meme (essai, alerte interne).
  school_id           uuid references schools(id) on delete cascade,

  to_e164             text not null,
  body                text not null,
  sender              text not null,
  provider            text not null,
  provider_message_id text,

  status              sms_status not null default 'QUEUED',
  -- Nombre de SMS reellement factures pour ce message.
  parts               integer not null default 1,
  cost                numeric(10,2),

  error_code          text,
  error_message       text,
  -- Un echec definitif ne se reessaie pas : numero invalide, cle refusee.
  permanent_failure   boolean not null default false,
  attempts            integer not null default 1,

  -- Notre propre reference, renvoyee par l'operateur avec l'accuse de reception.
  reference           text not null,
  kind                text not null default 'CREDENTIALS',

  created_by          uuid references users(id) on delete set null,
  created_at          timestamptz not null default now(),
  delivered_at        timestamptz,
  updated_at          timestamptz not null default now(),

  constraint sms_messages_phone check (to_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  constraint sms_messages_parts check (parts >= 1)
);

create index sms_messages_school_idx on sms_messages (school_id, created_at desc);
create index sms_messages_status_idx on sms_messages (status, created_at desc);
-- L'accuse de reception arrive avec l'identifiant de l'operateur : il doit se
-- retrouver vite, et une seule fois.
create unique index sms_messages_provider_key
  on sms_messages (provider, provider_message_id)
  where provider_message_id is not null;
create unique index sms_messages_reference_key on sms_messages (reference);

create trigger sms_messages_touch before update on sms_messages
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Acces
--
-- Un SMS porte un code de connexion : seuls ceux qui consultent deja
-- l'historique des acces de l'etablissement le voient, et l'administration de la plateforme qui paie la
-- facture. Personne n'ecrit depuis l'application : les lignes sont posees par
-- le service d'envoi.
-- -----------------------------------------------------------------------------

alter table sms_messages enable row level security;
alter table sms_messages force  row level security;

create policy sms_messages_select on sms_messages for select to authenticated
using (
  app.is_platform_admin()
  or (school_id is not null and school_id in (select app.my_schools_with('access_accounts.view_history')))
);

comment on table sms_messages is
  'Journal des SMS envoyes : etat de livraison, nombre de SMS factures, cause d''echec. Pose par le service d''envoi.';
comment on column sms_messages.parts is
  'Nombre de SMS factures. Un caractere hors alphabet GSM fait passer un message de 160 a 70 caracteres.';
