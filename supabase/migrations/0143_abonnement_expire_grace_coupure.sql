-- =============================================================================
-- 0143 — Abonnement expiré : délai de grâce, puis coupure ; le paiement rend tout
-- =============================================================================
-- Décidé le 2026-10-25 avec l'utilisateur :
--   - une école paie une fois par an ; essai fini ou année finie sans paiement =
--     « abonnement expiré » ;
--   - pendant le délai de grâce (15 jours par défaut, réglage plateforme
--     billing.graceDays) : un message à la direction seulement ;
--   - après : coupure pour TOUT le monde (direction, personnel, enseignants,
--     parents) — une page « abonnement expiré », et la base refuse toute
--     écriture (l'administration de la plateforme garde la main) ;
--   - un paiement confirmé rend l'accès tout de suite : l'abonnement devient
--     « abonnée » jusqu'au 31 août de l'année scolaire.
--
-- La coupure se lit À CHAQUE PAGE (situation réelle à la date du jour) : elle ne
-- dépend pas de la tâche de nuit, qui ne fait que remettre l'état à jour.
-- =============================================================================

-- 1. La situation d'une école (ou de toutes) ---------------------------------------
create or replace function app.school_situations(p_today date, p_school uuid)
returns table (
  school_id uuid,
  situation text,
  sub_status text,
  ends_on date,
  grace_ends_on date,
  plan_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with grace as (
    select coalesce((select (ps.settings->>'graceDays')::int from platform_settings ps where ps.namespace = 'billing'), 15) as days
  ),
  last_sub as (
    select distinct on (sb.school_id) sb.*
    from subscriptions sb
    where p_school is null or sb.school_id = p_school
    order by sb.school_id, sb.created_at desc
  ),
  sit as (
    select s.id,
           ls.status::text as sub_status,
           case
             when s.status in ('SUSPENDED', 'ARCHIVED') then 'STOPPED'
             when ls.id is null then 'NONE'
             when ls.status in ('SUSPENDED', 'CANCELLED') then 'STOPPED'
             when ls.status = 'PAST_DUE' then 'EXPIRED'
             when ls.status = 'TRIALING' and ls.trial_ends_at is not null and ls.trial_ends_at::date < p_today then 'EXPIRED'
             when ls.status = 'ACTIVE' and ls.current_period_end is not null and ls.current_period_end::date < p_today then 'EXPIRED'
             when ls.status = 'TRIALING' then 'TRIAL'
             else 'PAID'
           end as situation,
           case
             when ls.status = 'TRIALING' then ls.trial_ends_at::date
             when ls.status in ('ACTIVE', 'PAST_DUE') then ls.current_period_end::date
           end as ends_on,
           (select p.name from plans p where p.id = ls.plan_id) as plan_name
    from schools s
    left join last_sub ls on ls.school_id = s.id
    where p_school is null or s.id = p_school
  )
  select sit.id, sit.situation, sit.sub_status, sit.ends_on,
         case when sit.situation = 'EXPIRED' and sit.ends_on is not null then sit.ends_on + (select days from grace) end,
         sit.plan_name
  from sit;
$$;

create or replace function app.school_situations(p_today date)
returns table (school_id uuid, situation text, sub_status text, ends_on date, grace_ends_on date, plan_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from app.school_situations(p_today, null);
$$;

revoke all on function app.school_situations(date, uuid) from public, anon, authenticated;

-- 2. L'état d'abonnement d'UNE école, à la date du jour de la plateforme ------------
create or replace function app.school_billing(p_school uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'situation', x.situation,
           'endsOn', x.ends_on,
           'graceEndsOn', x.grace_ends_on,
           'blocked', x.situation = 'EXPIRED' and x.grace_ends_on is not null
                      and x.grace_ends_on < (now() at time zone 'Africa/Abidjan')::date
         )
  from app.school_situations((now() at time zone 'Africa/Abidjan')::date, p_school) x;
$$;

create or replace function app.school_is_blocked(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((app.school_billing(p_school)->>'blocked')::boolean, false);
$$;

-- 3. Écritures refusées pendant la coupure (l'administration de la plateforme garde la main)
create or replace function app.school_is_writable(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.schools s
    where s.id = p_school
      and s.status = 'ACTIVE'
  )
  and (app.is_platform_admin() or not app.school_is_blocked(p_school));
$$;

-- Le chemin de presque toutes les écritures (« school_id in my_writable_schools_with(...) ») :
-- calculé une fois par requête, pas par ligne — le contrôle de coupure n'y coûte rien.
create or replace function app.my_writable_schools_with(p_code text)
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select w.school_id
  from (select app.my_schools_with(p_code) as school_id) w
  join public.schools s on s.id = w.school_id and s.status = 'ACTIVE'
  where app.is_platform_admin() or not app.school_is_blocked(w.school_id);
$$;

-- 4. Un paiement confirmé : abonnée jusqu'au 31 août de l'année scolaire --------------
create or replace function app.payments_activate_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paid date := coalesce(new.paid_at, now())::date;
  -- Année scolaire du paiement : de septembre à août ; un paiement d'août vaut
  -- pour l'année qui commence (préparation de la rentrée).
  v_start date := make_date(extract(year from v_paid)::int - case when extract(month from v_paid) >= 8 then 0 else 1 end, 9, 1);
  v_end date := make_date(extract(year from v_paid)::int - case when extract(month from v_paid) >= 8 then 0 else 1 end + 1, 8, 31);
  v_sub uuid;
begin
  if new.status <> 'PAID' or (tg_op = 'UPDATE' and old.status = 'PAID') then
    return new;
  end if;
  v_sub := coalesce(
    new.subscription_id,
    (select sb.id from subscriptions sb where sb.school_id = new.school_id order by sb.created_at desc limit 1)
  );
  if v_sub is null then
    return new;
  end if;
  update subscriptions
     set status = 'ACTIVE',
         current_period_start = v_start,
         current_period_end = v_end
   where id = v_sub
     and (status <> 'ACTIVE' or current_period_end is null or current_period_end::date < v_end);
  return new;
end;
$$;

drop trigger if exists payments_activate_subscription on public.payments;
create trigger payments_activate_subscription
  after insert or update of status on public.payments
  for each row execute function app.payments_activate_subscription();

-- 5. La tâche de nuit : l'état suit la date ---------------------------------------
create or replace function public.billing_expire_due(p_today date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  update subscriptions
     set status = 'PAST_DUE'
   where (status = 'TRIALING' and trial_ends_at is not null and trial_ends_at::date < p_today)
      or (status = 'ACTIVE' and current_period_end is not null and current_period_end::date < p_today);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.billing_expire_due(date) from public, anon, authenticated;
grant execute on function public.billing_expire_due(date) to service_role;

-- 6. Le contexte de chaque page porte l'état d'abonnement -----------------------------
create or replace function public.app_context(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public', 'pg_temp'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_session   text := auth.jwt() ->> 'session_id';
  v_user      jsonb;
  v_admin     boolean;
  v_school_id uuid;
  v_school    jsonb;
begin
  if v_uid is null
     or v_session is null
     or v_session !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;

  -- Session coupee (acces suspendu, deconnexion de tous les appareils) ou echue
  if not exists (
    select 1
    from auth.sessions s
    where s.id = v_session::uuid
      and s.user_id = v_uid
      and (s.not_after is null or s.not_after > now())
  ) then
    return null;
  end if;

  select jsonb_build_object(
           'id', u.id,
           'email', u.email,
           'display_name', u.raw_user_meta_data ->> 'display_name',
           'first_name', u.raw_user_meta_data ->> 'first_name',
           'last_name', u.raw_user_meta_data ->> 'last_name',
           'must_change_password', coalesce(u.raw_app_meta_data -> 'must_change_password' = 'true'::jsonb, false)
         )
  into v_user
  from auth.users u
  where u.id = v_uid
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now());

  if v_user is null then
    return null;
  end if;

  v_admin := app.is_platform_admin();

  select s.id,
         jsonb_build_object(
           'id', s.id,
           'slug', s.slug,
           'name', s.name,
           'short_name', s.short_name,
           'status', s.status,
           'logo_url', s.logo_url,
           'primary_color', s.primary_color,
           'locale', s.locale,
           'timezone', s.timezone,
           'country_code', s.country_code,
           'login_code', s.login_code
         )
  into v_school_id, v_school
  from public.schools s
  where s.slug = p_slug
    and (v_admin or app.is_member_of(s.id));

  -- Slug inconnu, ou connu sans appartenance : school = null -> 404 cote application
  if v_school_id is null then
    return jsonb_build_object('user', v_user, 'is_platform_admin', v_admin, 'school', null);
  end if;

  return jsonb_build_object(
    'user', v_user,
    'is_platform_admin', v_admin,
    'school', v_school,
    'academic_year', (
      select jsonb_build_object('id', y.id, 'name', y.name)
      from public.academic_years y
      where y.school_id = v_school_id
        and y.is_current
      limit 1
    ),
    'membership_id', app.membership_id(v_school_id),
    'roles', to_jsonb(app.my_role_codes(v_school_id)),
    'permissions', to_jsonb(app.my_permission_codes(v_school_id)),
    -- Situation de l'abonnement (0143) : message pendant le délai de grâce,
    -- page « abonnement expiré » après.
    'billing', app.school_billing(v_school_id),
    -- Modules coupés pour cet établissement. Absent = actif.
    'disabled_features', coalesce(
      (
        select jsonb_agg(f.feature_code)
        from public.school_features f
        where f.school_id = v_school_id
          and not f.is_enabled
      ),
      '[]'::jsonb
    )
  );
end;
$function$;
