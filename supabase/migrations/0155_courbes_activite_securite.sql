-- =============================================================================
-- 0155 — Page Technique, lot C : courbes, activité, sécurité
-- =============================================================================
--
-- Décidé le 2026-10-27 (maquette docs/maquettes/super-admin-technique-v2.html,
-- onglets « Vue d'ensemble », « Activité », « Sécurité ») :
--
-- 1. platform_metric_series(p_hours) : les relevés (0153) regroupés par tranche
--    (5 min sur 24 h, 1 h sur 7 jours, 6 h sur 30 jours) — de quoi tracer les
--    courbes sans envoyer 8 000 relevés au navigateur.
-- 2. platform_activity() : le pouls du jour, école par école (personnes
--    connectées, appels faits, notes saisies, SMS envoyés, dernière action), et
--    les 7 derniers jours toutes écoles confondues.
-- 3. platform_security() : les connexions ratées des dernières 24 h par
--    identifiant, et les changements sensibles des 7 derniers jours.
--
-- Lecture seule, réservée à la plateforme.
-- =============================================================================

create or replace function public.platform_metric_series(p_hours int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hours int := least(greatest(coalesce(p_hours, 24), 1), 24 * 30);
  v_bucket interval := case when v_hours <= 24 then interval '5 minutes' when v_hours <= 168 then interval '1 hour' else interval '6 hours' end;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à la plateforme.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             't', b.t,
             'siteMs', b.site_ms, 'siteMax', b.site_max, 'siteDown', b.site_down,
             'memPct', b.mem_pct, 'cpuPct', b.cpu_pct, 'dbBytes', b.db_bytes, 'n', b.n
           ) order by b.t), '[]'::jsonb)
      from (
        select date_bin(v_bucket, taken_at, timestamptz '2026-01-01') as t,
               round(avg((data->'timings'->>'site')::numeric)) as site_ms,
               max((data->'timings'->>'site')::numeric) as site_max,
               count(*) filter (where data->'timings'->'site' = 'null'::jsonb) as site_down,
               round(avg(100.0 * (data->>'memUsed')::numeric / nullif((data->>'memTotal')::numeric, 0)), 1) as mem_pct,
               round(avg((data->>'cpu')::numeric), 1) as cpu_pct,
               max((data->'db'->>'bytes')::numeric) as db_bytes,
               count(*) as n
          from platform_metrics
         where taken_at > now() - make_interval(hours => v_hours)
         group by 1
      ) b
  );
end;
$$;
revoke all on function public.platform_metric_series(int) from public, anon;
grant execute on function public.platform_metric_series(int) to authenticated;

create or replace function public.platform_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Africa/Abidjan')::date;
  v_from timestamptz := (v_today::timestamp at time zone 'Africa/Abidjan');
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à la plateforme.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', v_today,
    'schools', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'slug', s.slug,
               'logins', (select count(distinct m.user_id) from school_memberships m join auth.users u on u.id = m.user_id
                           where m.school_id = s.id and u.last_sign_in_at >= v_from),
               'registers', (select count(*) from attendance_registers r where r.school_id = s.id and r.taken_at >= v_from),
               'grades', (select count(*) from grades g where g.school_id = s.id and g.entered_at >= v_from),
               'sms', (select count(*) from sms_messages x where x.school_id = s.id and x.created_at >= v_from),
               'lastAction', (select max(a.created_at) from audit_logs a where a.school_id = s.id and a.created_at > now() - interval '30 days')
             ) order by s.name), '[]'::jsonb)
        from schools s
       where s.status::text <> 'ARCHIVED'
    ),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'd', d.d,
               'registers', (select count(*) from attendance_registers r
                              where r.taken_at >= (d.d::timestamp at time zone 'Africa/Abidjan')
                                and r.taken_at < ((d.d + 1)::timestamp at time zone 'Africa/Abidjan')),
               'grades', (select count(*) from grades g
                           where g.entered_at >= (d.d::timestamp at time zone 'Africa/Abidjan')
                             and g.entered_at < ((d.d + 1)::timestamp at time zone 'Africa/Abidjan')),
               'sms', (select count(*) from sms_messages x
                        where x.created_at >= (d.d::timestamp at time zone 'Africa/Abidjan')
                          and x.created_at < ((d.d + 1)::timestamp at time zone 'Africa/Abidjan'))
             ) order by d.d), '[]'::jsonb)
        from (select generate_series(v_today - 6, v_today, interval '1 day')::date as d) d
    )
  );
end;
$$;
revoke all on function public.platform_activity() from public, anon;
grant execute on function public.platform_activity() to authenticated;

create or replace function public.platform_security()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à la plateforme.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'failures', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'key', f.attempt_key, 'n', f.n, 'last', f.last_at, 'recent', f.recent,
               'ips', f.ips,
               'school', (select s.name from schools s where f.attempt_key like 'school:%' and s.id::text = split_part(f.attempt_key, ':', 2))
             ) order by f.last_at desc), '[]'::jsonb)
        from (
          select attempt_key, count(*) as n, max(created_at) as last_at,
                 count(*) filter (where created_at > now() - interval '15 minutes') as recent,
                 count(distinct ip_address) as ips
            from login_attempts
           where created_at > now() - interval '24 hours'
           group by attempt_key
           order by max(created_at) desc
           limit 30
        ) f
    ),
    'failuresLastHour', (select count(*) from login_attempts where created_at > now() - interval '1 hour'),
    'changes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'action', a.action, 'at', a.created_at,
               'actor', (select coalesce(nullif(btrim(concat_ws(' ', u.last_name, u.first_name)), ''), u.auth_email) from users u where u.id = a.actor_user_id),
               'school', (select s.name from schools s where s.id = a.school_id)
             ) order by a.created_at desc), '[]'::jsonb)
        from (
          select action, created_at, actor_user_id, school_id
            from audit_logs
           where created_at > now() - interval '7 days'
             and action in (
               'platform.admin_create', 'platform.admin_grant', 'platform.admin_revoke', 'platform.owner_transfer',
               'platform.school_status', 'platform.template_save', 'platform.school_enter_direct',
               'roles.permissions.update', 'roles.permissions.reset', 'roles.customize',
               'access.suspend', 'access.change_login', 'access.sign_out', 'access.unlock'
             )
           order by created_at desc
           limit 40
        ) a
    )
  );
end;
$$;
revoke all on function public.platform_security() from public, anon;
grant execute on function public.platform_security() to authenticated;
