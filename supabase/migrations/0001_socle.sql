-- =============================================================================
-- 0001 — Socle : schema app, utilitaires, enumerations transverses
-- =============================================================================
--
-- Le schema `app` regroupe les fonctions de securite et de calcul. Les separer
-- de `public` evite qu'elles apparaissent dans l'API REST de Supabase, qui
-- n'expose que `public`.
--
-- Note : pas d'extension citext. Les comparaisons insensibles a la casse
-- passent par des index uniques sur lower(colonne) — meme garantie, sans
-- dependance a une extension ni probleme de search_path.
-- gen_random_uuid() est natif depuis PostgreSQL 13, aucune extension requise.

create schema if not exists app;

comment on schema app is
  'Fonctions de securite (RLS, RBAC) et de calcul metier. Non expose par PostgREST.';

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Horodatage automatique
-- -----------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function app.touch_updated_at is
  'Trigger BEFORE UPDATE : maintient updated_at. A poser sur toute table qui en possede une.';

-- -----------------------------------------------------------------------------
-- Enumerations transverses
--
-- Les enumerations propres a un domaine sont declarees dans la migration de ce
-- domaine : les regrouper toutes ici coupleraient l'ensemble du schema.
-- Ne restent ici que celles utilisees par plusieurs domaines.
-- -----------------------------------------------------------------------------

-- Portee d'une permission (docs/RBAC.md §3)
create type scope_type as enum (
  'GLOBAL',    -- plateforme entiere — Super Admin
  'SCHOOL',    -- tout l'etablissement
  'CYCLE',
  'LEVEL',
  'CLASS',
  'GROUP',
  'SUBJECT',
  'CHILDREN',  -- les enfants rattaches — parent
  'SELF'       -- soi-meme — eleve
);

-- Cycle de vie partage par les utilisateurs et les appartenances
create type account_status as enum ('CREATED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- Utilise par les eleves, les responsables et les enseignants
create type gender as enum ('M', 'F', 'OTHER');

-- Disponibilites : enseignants et salles partagent la meme semantique
create type availability_kind as enum (
  'AVAILABLE',    -- contrainte dure : cree une fenetre
  'UNAVAILABLE',  -- contrainte dure : ferme une fenetre
  'PREFERRED',    -- contrainte souple positive
  'AVOID'         -- contrainte souple negative
);

-- Origine d'une ecriture : distingue le temps reel de la synchronisation
-- differee (docs/OFFLINE_SYNC.md)
create type write_source as enum ('ONLINE', 'OFFLINE_SYNC', 'IMPORT', 'SYSTEM');
