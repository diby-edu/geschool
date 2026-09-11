-- =============================================================================
-- 0031 — Contexte de session : permissions et resolution d'identifiant
-- =============================================================================
--
-- getTenantContext() (couche applicative) charge en UNE fois les codes de
-- permission de l'utilisateur pour l'etablissement courant, puis hasPermission
-- devient une simple recherche dans un Set — aucun aller-retour par
-- verification. Cette fonction fournit ce chargement.

create or replace function app.my_permission_codes(p_school uuid)
returns text[]
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select coalesce(array_agg(distinct perm.code), '{}'::text[])
  from public.school_memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  join public.permissions perm on perm.id = rp.permission_id
  where m.user_id = auth.uid()
    and m.school_id = p_school
    and m.status = 'ACTIVE';
$$;

-- Codes de role de l'utilisateur dans l'etablissement (pour l'affichage et le
-- choix de l'espace : direction, enseignant, parent, eleve).
create or replace function app.my_role_codes(p_school uuid)
returns text[]
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select coalesce(array_agg(distinct r.code), '{}'::text[])
  from public.school_memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id
  where m.user_id = auth.uid()
    and m.school_id = p_school
    and m.status = 'ACTIVE';
$$;

grant execute on function
  app.my_permission_codes(uuid),
  app.my_role_codes(uuid)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Resolution d'un identifiant de connexion vers l'email Auth (ADR-005)
--
-- SECURITY DEFINER : appelee AVANT authentification (l'utilisateur n'a encore
-- aucune session), elle doit donc lire account_access et users hors RLS. Elle
-- ne renvoie qu'un email de connexion — jamais de secret, jamais de donnee
-- personnelle. Le controle anti-enumeration est fait cote applicatif (reponse
-- generique, tentative de connexion meme sur echec de resolution).
--
-- Reservee a service_role : le role authenticated n'y a pas acces, un
-- utilisateur deja connecte n'ayant aucune raison de resoudre un identifiant.
-- -----------------------------------------------------------------------------

create or replace function app.resolve_login_email(
  p_school     uuid,
  p_identifier text
)
returns text
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select u.auth_email
  from public.account_access aa
  join public.users u on u.id = aa.user_id
  where aa.school_id = p_school
    and lower(aa.login_identifier) = lower(p_identifier)
    and aa.account_status <> 'DISABLED'
  limit 1;
$$;

revoke all on function app.resolve_login_email(uuid, text) from public, authenticated;
grant execute on function app.resolve_login_email(uuid, text) to service_role;
