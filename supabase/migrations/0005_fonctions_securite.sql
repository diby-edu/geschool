-- =============================================================================
-- 0005 — Fonctions de securite
-- =============================================================================
--
-- Toutes en SECURITY DEFINER, STABLE, search_path fige.
--
-- SECURITY DEFINER n'est pas un confort : sans lui, la policy de
-- school_memberships appellerait une fonction qui lit school_memberships, donc
-- reevaluerait la policy — recursion infinie. C'est le piege classique de la
-- RLS sur Supabase. La fonction lit la table en contournant la RLS, ce qui est
-- sain : elle ne renvoie qu'un booleen, jamais de donnee.
--
-- STABLE n'est pas un confort non plus : PostgreSQL evalue alors la fonction
-- une fois par requete au lieu d'une fois par ligne. Sans cela, une policy sur
-- une table de 50 000 notes declencherait 50 000 sous-requetes.
--
-- search_path fige : sans lui, un schema place en tete du search_path par un
-- appelant permettrait de detourner les tables lues par une fonction DEFINER.

-- -----------------------------------------------------------------------------
-- Identite
-- -----------------------------------------------------------------------------

create or replace function app.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Super Admin plateforme (ADR-007)
-- -----------------------------------------------------------------------------

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.is_active
      and pa.revoked_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- Appartenance a un etablissement
-- -----------------------------------------------------------------------------

create or replace function app.is_member_of(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select p_school is not null and exists (
    select 1
    from public.school_memberships m
    where m.user_id = auth.uid()
      and m.school_id = p_school
      and m.status = 'ACTIVE'
  );
$$;

create or replace function app.member_school_ids()
returns uuid[]
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select coalesce(array_agg(m.school_id), '{}'::uuid[])
  from public.school_memberships m
  where m.user_id = auth.uid()
    and m.status = 'ACTIVE';
$$;

create or replace function app.membership_id(p_school uuid)
returns uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select m.id
  from public.school_memberships m
  where m.user_id = auth.uid()
    and m.school_id = p_school
    and m.status = 'ACTIVE'
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Etablissement inscriptible ?
--
-- Un etablissement suspendu ou archive reste lisible par ses membres mais
-- n'accepte plus aucune ecriture. Le Super Admin n'est pas concerne : les
-- policies le laissent passer avant meme d'appeler cette fonction.
-- -----------------------------------------------------------------------------

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
  );
$$;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------

create or replace function app.has_permission(p_school uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select p_school is not null and exists (
    select 1
    from public.school_memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.role_permissions rp on rp.role_id = mr.role_id
    join public.permissions perm on perm.id = rp.permission_id
    where m.user_id = auth.uid()
      and m.school_id = p_school
      and m.status = 'ACTIVE'
      and perm.code = p_code
  );
$$;

create or replace function app.has_any_permission(p_school uuid, p_codes text[])
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select p_school is not null and exists (
    select 1
    from public.school_memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.role_permissions rp on rp.role_id = mr.role_id
    join public.permissions perm on perm.id = rp.permission_id
    where m.user_id = auth.uid()
      and m.school_id = p_school
      and m.status = 'ACTIVE'
      and perm.code = any (p_codes)
  );
$$;

-- Raccourci de lecture : membre de l'etablissement ET porteur de la permission,
-- ou Super Admin. C'est la forme utilisee par la majorite des policies SELECT.
create or replace function app.can_read(p_school uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select app.is_platform_admin()
      or (app.is_member_of(p_school) and app.has_permission(p_school, p_code));
$$;

-- Forme utilisee par la majorite des policies d'ecriture : ajoute la condition
-- d'etablissement inscriptible.
create or replace function app.can_write(p_school uuid, p_code text)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select app.is_platform_admin()
      or (
        app.is_member_of(p_school)
        and app.school_is_writable(p_school)
        and app.has_permission(p_school, p_code)
      );
$$;

-- -----------------------------------------------------------------------------
-- Perimetres explicites (derogations)
--
-- Les perimetres DERIVES du metier (classes d'un enseignant, enfants d'un
-- parent) sont definis dans les migrations qui creent les tables concernees.
-- -----------------------------------------------------------------------------

create or replace function app.has_scope_grant(
  p_school uuid,
  p_scope  scope_type,
  p_target uuid
)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.school_memberships m
    join public.membership_scope_grants g on g.membership_id = m.id
    where m.user_id = auth.uid()
      and m.school_id = p_school
      and m.status = 'ACTIVE'
      and g.scope_type = p_scope
      and (g.scope_id = p_target or g.scope_id is null)
  );
$$;

-- -----------------------------------------------------------------------------
-- Visibilite entre utilisateurs
--
-- Deux utilisateurs ne se voient que s'ils partagent un etablissement. Sans
-- cela, l'annuaire des utilisateurs traverserait les etablissements.
-- -----------------------------------------------------------------------------

create or replace function app.shares_school_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.school_memberships mine
    join public.school_memberships theirs on theirs.school_id = mine.school_id
    where mine.user_id = auth.uid()
      and mine.status = 'ACTIVE'
      and theirs.user_id = p_user
      and theirs.status = 'ACTIVE'
  );
$$;

-- Puis-je administrer ce compte ? Vrai si nous partageons un etablissement
-- dans lequel je porte users.update.
create or replace function app.can_manage_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.school_memberships mine
    join public.membership_roles mr on mr.membership_id = mine.id
    join public.role_permissions rp on rp.role_id = mr.role_id
    join public.permissions perm on perm.id = rp.permission_id
    join public.school_memberships theirs on theirs.school_id = mine.school_id
    where mine.user_id = auth.uid()
      and mine.status = 'ACTIVE'
      and perm.code = 'users.update'
      and theirs.user_id = p_user
  );
$$;

-- -----------------------------------------------------------------------------
-- Outillage de verification de la RLS
--
-- Utilise par la suite de tests : elle enumere les tables portant un school_id
-- et signale celles dont la RLS n'est pas activee, pas forcee, ou dont une des
-- quatre commandes n'est couverte par aucune policy.
--
-- C'est le garde-fou qui empeche qu'une table arrive un jour sans protection :
-- l'oubli fait echouer la CI, il ne passe pas inapercu.
-- -----------------------------------------------------------------------------

create or replace function app.tenant_tables_without_rls()
returns table (
  table_name    text,
  rls_enabled   boolean,
  rls_forced    boolean,
  has_select    boolean,
  has_insert    boolean,
  has_update    boolean,
  has_delete    boolean
)
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  with tenant_tables as (
    select c.oid, c.relname::text as name, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attname = 'school_id'
      and a.attnum > 0
      and not a.attisdropped
  ),
  policy_cmds as (
    select p.polrelid,
           bool_or(p.polcmd in ('r', '*')) as sel,
           bool_or(p.polcmd in ('a', '*')) as ins,
           bool_or(p.polcmd in ('w', '*')) as upd,
           bool_or(p.polcmd in ('d', '*')) as del
    from pg_policy p
    group by p.polrelid
  )
  select t.name,
         t.relrowsecurity,
         t.relforcerowsecurity,
         coalesce(pc.sel, false),
         coalesce(pc.ins, false),
         coalesce(pc.upd, false),
         coalesce(pc.del, false)
  from tenant_tables t
  left join policy_cmds pc on pc.polrelid = t.oid
  where not t.relrowsecurity
     or not t.relforcerowsecurity
     or not coalesce(pc.sel, false)
     or not coalesce(pc.ins, false)
     or not coalesce(pc.upd, false)
     or not coalesce(pc.del, false)
  order by t.name;
$$;

comment on function app.tenant_tables_without_rls is
  'Tables portant un school_id dont la protection RLS est incomplete. Doit toujours renvoyer zero ligne.';

-- -----------------------------------------------------------------------------
-- Droits d'execution
-- -----------------------------------------------------------------------------

revoke all on all functions in schema app from public;

grant execute on function
  app.current_user_id(),
  app.is_platform_admin(),
  app.is_member_of(uuid),
  app.member_school_ids(),
  app.membership_id(uuid),
  app.school_is_writable(uuid),
  app.has_permission(uuid, text),
  app.has_any_permission(uuid, text[]),
  app.can_read(uuid, text),
  app.can_write(uuid, text),
  app.has_scope_grant(uuid, scope_type, uuid),
  app.shares_school_with(uuid),
  app.can_manage_user(uuid)
to authenticated, service_role;

grant execute on function app.tenant_tables_without_rls() to service_role;
