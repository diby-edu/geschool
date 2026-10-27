-- =============================================================================
-- 0150 — Modèles des fonctions, réglés par la plateforme (lot 6 du Super Admin)
-- =============================================================================
--
-- Décidé le 2026-10-26 (maquette docs/maquettes/super-admin-reglages.html) :
--   - le Super Admin règle les droits de départ de chaque fonction (les
--     « modèles » : rôles sans école, copiés dans chaque nouvelle école par
--     app.ensure_school_roles) ;
--   - à chaque enregistrement, au choix : seulement les nouvelles écoles, ou
--     aussi les écoles existantes — pour elles, on AJOUTE les droits cochés à
--     leur fonction, on n'en retire JAMAIS (chaque école a pu régler les siens) ;
--   - il peut créer une nouvelle fonction (code « F_… », nom libre), donnée aux
--     nouvelles écoles, et au choix aux écoles existantes.
--
-- Le Fondateur reste complet (tous les droits) ; l'Enseignant, le Parent et
-- l'Élève n'ont pas de droits réglables (leur périmètre se calcule) : ces
-- modèles-là ne se modifient pas ici.
-- =============================================================================

-- 1. Enregistrer les droits d'un modèle -----------------------------------------
-- p_shown : les droits affichés à cocher (le catalogue). Seuls ceux-là peuvent
-- être retirés : un droit technique hors catalogue n'est jamais touché.
create or replace function public.platform_save_template(p_code text, p_permissions text[], p_shown text[], p_existing boolean)
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tpl uuid;
  v_schools integer := 0;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = '42501';
  end if;
  if p_code in ('SCHOOL_ADMIN', 'PARENT', 'STUDENT', 'TEACHER') then
    raise exception 'Cette fonction ne se règle pas ici.' using errcode = '22023';
  end if;
  select id into v_tpl from roles where school_id is null and code = p_code;
  if v_tpl is null then
    raise exception 'Fonction inconnue : %.', p_code using errcode = '22023';
  end if;

  perform set_config('app.roles_provisioning', 'on', true);

  delete from role_permissions rp
  using permissions p
  where rp.role_id = v_tpl and p.id = rp.permission_id
    and p.code = any (p_shown) and not (p.code = any (p_permissions));

  insert into role_permissions (role_id, permission_id)
  select v_tpl, p.id from permissions p
  where p.code = any (p_permissions) and p.code = any (p_shown) and not p.is_platform_only
  on conflict do nothing;

  if p_existing then
    -- Aux écoles existantes : on ajoute, on ne retire rien.
    with added as (
      insert into role_permissions (role_id, permission_id)
      select r.id, p.id
      from roles r
      join permissions p on p.code = any (p_permissions) and p.code = any (p_shown) and not p.is_platform_only
      where r.school_id is not null and r.code = p_code
      on conflict do nothing
      returning role_id
    )
    select count(distinct r.school_id) into v_schools
    from added a join roles r on r.id = a.role_id;
  end if;

  perform set_config('app.roles_provisioning', 'off', true);
  return v_schools;
end;
$$;
revoke all on function public.platform_save_template(text, text[], text[], boolean) from public, anon;
grant execute on function public.platform_save_template(text, text[], text[], boolean) to authenticated;

-- 2. Créer une nouvelle fonction ------------------------------------------------
create or replace function public.platform_create_function(p_code text, p_name text, p_description text, p_copy_from text)
returns text
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tpl uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = '42501';
  end if;
  if p_code !~ '^F_[A-Z0-9_]{2,40}$' then
    raise exception 'Code de fonction invalide.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_name, '')) = '' or length(p_name) > 60 then
    raise exception 'Nom de fonction invalide.' using errcode = '22023';
  end if;
  if exists (select 1 from roles where school_id is null and (code = p_code or lower(name) = lower(btrim(p_name)))) then
    raise exception 'Cette fonction existe déjà.' using errcode = '23505';
  end if;

  perform set_config('app.roles_provisioning', 'on', true);
  insert into roles (school_id, code, name, description, is_system, level)
  values (null, p_code, btrim(p_name), coalesce(p_description, ''), true, 'SCHOOL')
  returning id into v_tpl;

  if p_copy_from is not null and p_copy_from not in ('SCHOOL_ADMIN', 'PARENT', 'STUDENT', 'TEACHER') then
    insert into role_permissions (role_id, permission_id, default_scope)
    select v_tpl, rp.permission_id, rp.default_scope
    from role_permissions rp join roles r on r.id = rp.role_id
    where r.school_id is null and r.code = p_copy_from;
  end if;
  perform set_config('app.roles_provisioning', 'off', true);
  return p_code;
end;
$$;
revoke all on function public.platform_create_function(text, text, text, text) from public, anon;
grant execute on function public.platform_create_function(text, text, text, text) to authenticated;

-- 3. Donner les fonctions manquantes aux écoles existantes ----------------------
-- (les nouvelles écoles les reçoivent à l'inscription.)
create or replace function public.platform_push_functions()
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_total integer := 0;
  s record;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = '42501';
  end if;
  for s in select id from schools where exists (select 1 from roles r where r.school_id = schools.id) loop
    v_total := v_total + app.ensure_school_roles(s.id);
  end loop;
  return v_total;
end;
$$;
revoke all on function public.platform_push_functions() from public, anon;
grant execute on function public.platform_push_functions() to authenticated;

-- 4. Les coordonnées du support, lisibles par les écoles ------------------------
-- (Réglages de la plateforme, namespace « platform » : le reste — durée de
-- l'essai, seuil « à risque » — ne les regarde pas.)
create or replace function public.platform_contact_public()
returns table(name text, support_phone text, support_email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(ps.settings->>'name', ''),
    coalesce(ps.settings->>'supportPhone', ''),
    coalesce(ps.settings->>'supportEmail', '')
  from platform_settings ps
  where ps.namespace = 'platform';
$$;
revoke all on function public.platform_contact_public() from public, anon;
grant execute on function public.platform_contact_public() to authenticated;
