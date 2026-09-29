-- =============================================================================
-- 0057 — Contexte d'etablissement en une seule requete
-- =============================================================================
--
-- PROBLEME  getTenantContext() (src/lib/tenant/context.ts) enchainait trois
--           allers-retours vers Supabase avant la premiere donnee de page :
--           getUser() (Auth), puis schools, puis cinq requetes en parallele
--           (is_platform_admin, my_role_codes, my_permission_codes, annee
--           courante, appartenance). La base est distante (150-250 ms par
--           aller-retour) : 0,5 a 0,7 s perdues sur CHAQUE page de l'espace
--           etablissement.
--
-- CORRECTIF public.app_context(slug) renvoie tout en un seul appel, avec les
--           memes regles qu'avant, appliquees dans la base :
--             - etablissement visible = membre ACTIF ou Super Admin (comme la
--               policy schools_select) ; sinon school = null -> 404 ;
--             - roles, permissions, appartenance : memes fonctions app.*.
--
-- SESSION   getUser() verifiait aussi aupres d'Auth que la session existe
--           encore. C'est ce qui rend la suspension d'un acces IMMEDIATE
--           (0047 : revoke_user_sessions supprime les sessions) : un jeton deja
--           emis reste cryptographiquement valide jusqu'a son expiration. La
--           fonction refait ce controle : session du jeton (claim session_id)
--           toujours presente et non echue, compte ni banni ni supprime.
--           Sinon : null, que l'application traite comme « non connecte ».
--           Le drapeau must_change_password est lu ici a la source (et non dans
--           le jeton, qui peut dater d'avant une reinitialisation).
--
-- SECURITY DEFINER : lecture de auth.sessions et auth.users, inaccessibles au
-- role authenticated. La fonction ne renvoie que les donnees de l'appelant
-- (auth.uid()), et l'etablissement seulement s'il y a acces.
-- STABLE : appelee en GET, donc en transaction lecture seule, et relancable
-- sans risque par src/lib/supabase/limited-fetch.ts.

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
    'permissions', to_jsonb(app.my_permission_codes(v_school_id))
  );
end;
$$;

revoke all on function public.app_context(text) from public, anon;
grant execute on function public.app_context(text) to authenticated, service_role;
