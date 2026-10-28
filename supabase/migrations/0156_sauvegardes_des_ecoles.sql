-- =============================================================================
-- 0156 — Sauvegardes des écoles
-- =============================================================================
--
-- Décidé le 2026-10-28 (maquette docs/maquettes/ecole-sauvegardes.html) :
--
-- Une école sauvegarde elle-même toutes ses données (toute l'école ou une
-- année), les télécharge, et peut remettre une sauvegarde : tout, ou des
-- catégories choisies (notes, présences, paramètres…). La sauvegarde de l'année
-- se fait toute seule à sa clôture.
--
-- `school_backups` : le compte rendu de chaque sauvegarde ET de chaque remise
-- (kind). Le fichier reste sur le VPS, signé : un fichier retouché ou d'une
-- autre école est refusé à la remise. Écrit par le serveur seulement.
--
-- Deux droits à cocher :
--   backup.manage  — sauvegarder et télécharger (Fondateur, Informaticien) ;
--   backup.restore — remettre une sauvegarde (Fondateur).
-- =============================================================================

create table if not exists school_backups (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools(id) on delete cascade,
  kind             text not null default 'BACKUP' check (kind in ('BACKUP', 'RESTORE')),
  status           text not null default 'RUNNING' check (status in ('RUNNING', 'OK', 'FAILED')),
  -- BACKUP : ce qui est copié. RESTORE : sans objet.
  scope            text not null default 'SCHOOL' check (scope in ('SCHOOL', 'YEAR')),
  academic_year_id uuid references academic_years(id) on delete set null,
  trigger          text not null default 'MANUAL' check (trigger in ('MANUAL', 'YEAR_CLOSE', 'BEFORE_RESTORE', 'UPLOAD')),
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz,
  file_name        text,
  size_bytes       bigint,
  -- BACKUP : nombre de lignes par table. RESTORE : ce qui a été remis ou non, par catégorie.
  counts           jsonb not null default '{}'::jsonb,
  -- RESTORE : la sauvegarde remise et les catégories choisies.
  restore_of       uuid references school_backups(id) on delete set null,
  categories       text[] not null default '{}',
  error            text
);
create index if not exists school_backups_school_idx on school_backups (school_id, created_at desc);

comment on table school_backups is
  'Sauvegardes et remises de sauvegarde d''une école (le fichier reste sur le VPS). Écrit par le serveur seulement.';

alter table school_backups enable row level security;
alter table school_backups force row level security;
create policy school_backups_select on school_backups for select to authenticated using (
  app.is_platform_admin()
  or (app.is_member_of(school_id) and (app.has_permission(school_id, 'backup.manage') or app.has_permission(school_id, 'backup.restore')))
);

insert into permissions (code, module, action, description, is_platform_only) values
  ('backup.manage', 'backup', 'manage', 'Sauvegarder les donnees de l ecole et telecharger les sauvegardes', false),
  ('backup.restore', 'backup', 'restore', 'Remettre une sauvegarde de l ecole', false)
on conflict (code) do nothing;

with cible as (
  select p.id permission_id, r.id role_id
    from permissions p
    join roles r on (p.code = 'backup.manage' and r.code = any (array['SCHOOL_ADMIN', 'IT_ADMIN']))
                 or (p.code = 'backup.restore' and r.code = 'SCHOOL_ADMIN')
   where p.code in ('backup.manage', 'backup.restore')
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;
