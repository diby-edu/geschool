-- =============================================================================
-- 0003 — Utilisateurs et appartenances
-- =============================================================================

create type membership_status as enum ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- -----------------------------------------------------------------------------
-- users — miroir applicatif de auth.users
--
-- Cette table n'est PAS multi-tenant : un utilisateur existe au niveau
-- plateforme, son rattachement passe par school_memberships.
--
-- auth_email peut etre un email reel (personnel) ou un email synthetique
-- invisible de l'utilisateur (parents et eleves, ADR-005). Dans ce second cas
-- l'identifiant humain — telephone ou matricule — vit dans account_access.
-- -----------------------------------------------------------------------------

create table users (
  id                uuid primary key references auth.users(id) on delete cascade,

  auth_email        text not null,
  contact_email     text,
  phone_e164        text,

  first_name        text not null default '',
  last_name         text not null default '',
  display_name      text,

  avatar_url        text,
  locale            text not null default 'fr',
  status            account_status not null default 'ACTIVE',

  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint users_phone_e164 check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);

create unique index users_auth_email_key on users (lower(auth_email));
create index users_phone_idx on users (phone_e164) where phone_e164 is not null;

create trigger users_touch before update on users
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Synchronisation depuis auth.users
--
-- Tous les comptes sont normalement crees par notre code serveur, qui insere
-- lui-meme la ligne users. Ce trigger couvre le cas ou un compte est cree
-- autrement — depuis le dashboard Supabase, par exemple — et evite qu'un
-- utilisateur authentifie n'ait aucun profil applicatif.
-- -----------------------------------------------------------------------------

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
begin
  insert into public.users (id, auth_email, first_name, last_name, display_name, phone_e164)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@accounts.invalid'),
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.phone, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- school_memberships — le rattachement d'un utilisateur a un etablissement
--
-- Index (user_id, school_id, status) : chaque policy RLS du schema en depend.
-- C'est l'index le plus sollicite de toute la base.
-- -----------------------------------------------------------------------------

create table school_memberships (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,

  status        membership_status not null default 'ACTIVE',
  job_title     text,

  joined_at     timestamptz not null default now(),
  disabled_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (school_id, user_id)
);

create index school_memberships_lookup_idx
  on school_memberships (user_id, school_id, status);
create index school_memberships_school_idx
  on school_memberships (school_id, status);

create trigger school_memberships_touch before update on school_memberships
  for each row execute function app.touch_updated_at();

comment on index school_memberships_lookup_idx is
  'Index critique : interroge par app.is_member_of() et app.has_permission(), donc par chaque policy RLS.';
