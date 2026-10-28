-- =============================================================================
-- 0154 — Page Technique, lot B : alertes et file des tâches
-- =============================================================================
--
-- Décidé le 2026-10-27 (maquette docs/maquettes/super-admin-technique-v2.html,
-- onglets « Tâches » et « Alertes ») :
--
-- 1. `platform_alerts` : une ligne par problème, ouverte quand un voyant passe
--    au rouge, fermée quand il redevient normal. On envoie à l'ouverture, on
--    rappelle si le problème dure, on prévient quand il est réglé. Un seul
--    problème ouvert à la fois par sorte (index unique partiel). Gardé 90 jours.
--
-- 2. `platform_job_queue()` : la file des tâches du worker (pg-boss) sur
--    7 jours — combien en attente, en cours, réussies, échouées, par tâche —
--    et les dernières échouées avec leur message d'erreur.
--
-- Les réglages des alertes (où, quand, seuils) vivent dans platform_settings,
-- section « alerts » (0088) : aucune table de plus.
-- =============================================================================

create table if not exists platform_alerts (
  id            uuid primary key default gen_random_uuid(),
  key           text not null,
  severity      text not null default 'red' check (severity in ('red', 'orange')),
  message       text not null,
  opened_at     timestamptz not null default now(),
  last_sent_at  timestamptz,
  reminders     integer not null default 0,
  sent_channels text[] not null default '{}',
  resolved_at   timestamptz,
  constraint platform_alerts_key_not_blank check (length(btrim(key)) > 0)
);
create unique index if not exists platform_alerts_one_open_per_key on platform_alerts (key) where resolved_at is null;
create index if not exists platform_alerts_opened_idx on platform_alerts (opened_at desc);

comment on table platform_alerts is
  'Alertes de la page Technique : une ligne par problème, de son ouverture à sa résolution. Gardé 90 jours.';

alter table platform_alerts enable row level security;
alter table platform_alerts force row level security;
create policy platform_alerts_select on platform_alerts for select to authenticated using (app.is_platform_admin());

create or replace function public.platform_job_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_counts jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
begin
  -- La plateforme, ou le serveur lui-même (le worker y lit les tâches
  -- échouées pour les alertes).
  if not (app.is_platform_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Réservé à la plateforme.' using errcode = '42501';
  end if;
  if to_regclass('pgboss.job') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'state', state, 'n', n)), '[]'::jsonb)
        from (
          select name, state::text as state, count(*) as n
            from pgboss.job
           where created_on > now() - interval '7 days' and name not like '\_\_%'
           group by name, state
        ) c
    $q$ into v_counts;
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'createdOn', created_on, 'completedOn', completed_on,
               'error', left(coalesce(output->>'message', output::text), 400)
             ) order by created_on desc), '[]'::jsonb)
        from (
          select id, name, created_on, completed_on, output
            from pgboss.job
           where state = 'failed' and created_on > now() - interval '7 days' and name not like '\_\_%'
           order by created_on desc
           limit 15
        ) f
    $q$ into v_failed;
  end if;
  return jsonb_build_object('counts', v_counts, 'failed', v_failed);
end;
$$;
revoke all on function public.platform_job_queue() from public, anon;
grant execute on function public.platform_job_queue() to authenticated, service_role;
