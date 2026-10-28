-- =============================================================================
-- 0153 — Page Technique, lot A : relevés du serveur et sauvegardes
-- =============================================================================
--
-- Décidé le 2026-10-27 (maquette docs/maquettes/super-admin-technique-v2.html) :
--
-- 1. `platform_metrics` : un relevé toutes les 5 minutes, fait par le worker
--    sur le VPS (processeur, mémoire, disque, programmes PM2, temps de réponse,
--    taille de la base). Un seul champ jsonb : le contenu d'un relevé grandira
--    avec les lots suivants sans nouvelle migration. Gardé 30 jours
--    (≈ 8 600 lignes, quelques Mo).
--
-- 2. `platform_backups` : une ligne par copie de la base (pg_dump sur le VPS,
--    chaque nuit à 2 h ou à la demande) : quand, combien de temps, quelle
--    taille, réussie ou non. Le fichier lui-même reste sur le VPS, hors du site.
--
-- 3. `platform_db_probe()` : taille et connexions de la base, pour le relevé.
--
-- Écrit par le serveur (service_role) ; lu par la plateforme seulement.
-- =============================================================================

create table if not exists platform_metrics (
  id       bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  data     jsonb not null
);
create index if not exists platform_metrics_taken_at_idx on platform_metrics (taken_at desc);

comment on table platform_metrics is
  'Relevé de surveillance toutes les 5 min (serveur, programmes, temps de réponse, base). Gardé 30 jours.';

alter table platform_metrics enable row level security;
alter table platform_metrics force row level security;
create policy platform_metrics_select on platform_metrics for select to authenticated using (app.is_platform_admin());

create table if not exists platform_backups (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'RUNNING' check (status in ('RUNNING', 'OK', 'FAILED')),
  trigger     text not null default 'NIGHT' check (trigger in ('NIGHT', 'MANUAL')),
  file_name   text,
  size_bytes  bigint,
  duration_ms integer,
  error       text
);
create index if not exists platform_backups_started_idx on platform_backups (started_at desc);

comment on table platform_backups is
  'Copies de la base (pg_dump sur le VPS). Le fichier reste sur le serveur ; ici, seulement le compte rendu.';

alter table platform_backups enable row level security;
alter table platform_backups force row level security;
create policy platform_backups_select on platform_backups for select to authenticated using (app.is_platform_admin());

create or replace function public.platform_db_probe()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'bytes', pg_database_size(current_database()),
    'connections', (select count(*) from pg_stat_activity where datname = current_database()),
    'maxConnections', current_setting('max_connections')::int,
    'cacheHit', (
      select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2)
        from pg_stat_database where datname = current_database()
    )
  );
$$;
revoke all on function public.platform_db_probe() from public, anon, authenticated;
grant execute on function public.platform_db_probe() to service_role;
