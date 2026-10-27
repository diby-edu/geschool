-- =============================================================================
-- 0151 — La page Technique (lot 7 du Super Admin)
-- =============================================================================
--
-- Décidé le 2026-10-26 (maquette docs/maquettes/super-admin-technique.html) :
--
-- 1. Journal des erreurs de l'application, dans la base. Une ligne par erreur
--    distincte (même message, même page) : son nombre de fois, la première et
--    la dernière. On garde 30 jours. Écrit par le serveur (service_role, via
--    public.log_app_error) ; lu et vidé par la plateforme seulement.
--
-- 2. public.platform_technical_status() : en une lecture, l'état des tâches de
--    nuit (pg-boss), des SMS, de la base (taille, plus grosses tables,
--    migrations, connexions) et des connexions ratées.
-- =============================================================================

create table if not exists app_errors (
  id          uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  message     text not null,
  path        text,
  digest      text,
  detail      text,
  occurrences integer not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists app_errors_last_seen_idx on app_errors (last_seen desc);

alter table app_errors enable row level security;
alter table app_errors force row level security;
create policy app_errors_select on app_errors for select to authenticated using (app.is_platform_admin());
create policy app_errors_delete on app_errors for delete to authenticated using (app.is_platform_admin());

create or replace function public.log_app_error(p_message text, p_path text, p_digest text, p_detail text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message text := left(coalesce(nullif(btrim(p_message), ''), 'Erreur sans message'), 500);
  v_path text := left(regexp_replace(coalesce(p_path, ''), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '…', 'gi'), 300);
begin
  insert into app_errors (fingerprint, message, path, digest, detail)
  values (md5(v_message || '|' || v_path), v_message, nullif(v_path, ''), left(p_digest, 80), left(p_detail, 4000))
  on conflict (fingerprint) do update
    set occurrences = app_errors.occurrences + 1,
        last_seen = now(),
        digest = coalesce(excluded.digest, app_errors.digest),
        detail = coalesce(excluded.detail, app_errors.detail);
  -- Ménage : 30 jours.
  if random() < 0.05 then
    delete from app_errors where last_seen < now() - interval '30 days';
  end if;
end;
$$;
revoke all on function public.log_app_error(text, text, text, text) from public, anon, authenticated;
grant execute on function public.log_app_error(text, text, text, text) to service_role;

create or replace function public.platform_technical_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_jobs jsonb := '[]'::jsonb;
  v_schedules jsonb := '[]'::jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = '42501';
  end if;

  -- pg-boss n'existe pas forcément (worker jamais démarré) : on le dit sans échouer.
  if to_regclass('pgboss.job') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', name,
               'lastCompleted', (select max(completed_on) from pgboss.job j2 where j2.name = q.name and j2.state = 'completed'),
               'lastFailed', (select max(completed_on) from pgboss.job j2 where j2.name = q.name and j2.state = 'failed'),
               'failed7d', (select count(*) from pgboss.job j2 where j2.name = q.name and j2.state = 'failed' and j2.created_on > now() - interval '7 days'),
               'waiting', (select count(*) from pgboss.job j2 where j2.name = q.name and j2.state in ('created', 'retry'))
             )), '[]'::jsonb)
      from (select distinct name from pgboss.job) q
    $q$ into v_jobs;
  end if;
  if to_regclass('pgboss.schedule') is not null then
    execute $q$ select coalesce(jsonb_agg(jsonb_build_object('name', name, 'cron', cron)), '[]'::jsonb) from pgboss.schedule $q$ into v_schedules;
  end if;

  return jsonb_build_object(
    'pgboss', to_regclass('pgboss.job') is not null,
    'jobs', v_jobs,
    'schedules', v_schedules,
    'dbBytes', pg_database_size(current_database()),
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', t.bytes) order by t.bytes desc), '[]'::jsonb)
      from (
        select c.relname, pg_total_relation_size(c.oid) as bytes
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and n.nspname = 'public'
        order by 2 desc limit 6
      ) t
    ),
    'connections', (select count(*) from pg_stat_activity),
    'migrations', (select count(*) from _migrations),
    'lastMigration', (select name from _migrations order by name desc limit 1),
    'sms', jsonb_build_object(
      'sent7d', (select count(*) from sms_messages where created_at > now() - interval '7 days' and status <> 'FAILED'),
      'failed7d', (select count(*) from sms_messages where created_at > now() - interval '7 days' and status = 'FAILED'),
      'pending', (select count(*) from sms_messages where status = 'SENT' and created_at > now() - interval '3 days'),
      'lastFailure', (
        select jsonb_build_object('at', created_at, 'error', coalesce(error_message, error_code))
        from sms_messages where status = 'FAILED' order by created_at desc limit 1
      )
    ),
    'loginFailures24h', (select count(*) from login_attempts where created_at > now() - interval '24 hours'),
    'lockedNow', (
      select count(*) from (
        select attempt_key from login_attempts where created_at > now() - interval '15 minutes'
        group by attempt_key having count(*) >= 5
      ) l
    ),
    'platformAdmins', (select count(*) from platform_admins where is_active),
    'errors7d', (select coalesce(sum(occurrences), 0) from app_errors where last_seen > now() - interval '7 days')
  );
end;
$$;
revoke all on function public.platform_technical_status() from public, anon;
grant execute on function public.platform_technical_status() to authenticated;
