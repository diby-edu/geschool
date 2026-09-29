-- =============================================================================
-- 0070 — Modules activés par école
-- =============================================================================
--
-- `school_features` existe depuis 0026 (code du module + activé ou non) mais
-- rien ne la lisait : toutes les écoles voyaient tous les modules. Impossible
-- de vendre une formule de base et une formule complète, ni de couper un module
-- qu'une école n'utilise pas.
--
-- On ne crée pas de table : on fait remonter l'information avec le contexte
-- (0057), en UN seul appel, pour ne pas ajouter une requête à chaque page.
-- Seuls les modules DÉSACTIVÉS sont renvoyés : la liste est presque toujours
-- vide, et un module inconnu de la base reste actif — ajouter un module au
-- catalogue n'exige donc aucune migration.

create or replace function public.app_context(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public, pg_temp
as $$
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
$$;

revoke all on function public.app_context(text) from public, anon;
grant execute on function public.app_context(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Écriture : seule la plateforme décide des modules d'une école (c'est ce qui
-- est vendu). L'établissement, lui, les lit — la RLS de 0026 laissait passer
-- toute écriture membre, ce qui reviendrait à s'offrir les modules soi-même.
-- -----------------------------------------------------------------------------

alter table school_features enable row level security;
alter table school_features force  row level security;

drop policy if exists school_features_select on school_features;
create policy school_features_select on school_features for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

drop policy if exists school_features_insert on school_features;
create policy school_features_insert on school_features for insert to authenticated
with check (app.is_platform_admin());

drop policy if exists school_features_update on school_features;
create policy school_features_update on school_features for update to authenticated
using (app.is_platform_admin())
with check (app.is_platform_admin());

drop policy if exists school_features_delete on school_features;
create policy school_features_delete on school_features for delete to authenticated
using (app.is_platform_admin());
