-- 0050 — Roles et permissions par etablissement
--
-- Objectif : le fondateur liste les fonctions de son personnel et coche ou
-- decoche chaque droit, et ce qui est decoche est REFUSE (application ET base).
--
-- Ce que fait cette migration :
--   1. Nouvelles fonctions (modeles systeme) : Directeur adjoint, Surveillant
--      general, Inspecteur d'education, Informaticien. Le role « Administrateur »
--      s'appelle desormais « Fondateur » ; « Comptable » n'est plus propose (le
--      produit ne gere pas l'argent des inscriptions) mais sa ligne est conservee.
--   2. Permission `reports.sign` : signature du bulletin (par defaut : Directeur
--      et Fondateur), garde-fou en base sur les transitions du bulletin.
--   3. Duplication des roles PAR ETABLISSEMENT (`app.ensure_school_roles`) : un
--      etablissement ajuste ses droits sans toucher au modele partage. La base
--      resolvait deja les droits par `membership_roles -> role_permissions`, donc
--      un role propre a l'etablissement est respecte partout, RLS comprise.
--   4. Garde-fous en base contre l'auto-promotion : on ne peut ni modifier le
--      role Fondateur, ni accorder un droit qu'on ne possede pas, ni attribuer une
--      fonction qui en contient un.
--   5. Signal en direct quand les droits changent (menus mis a jour sans recharger).
--
-- Donnees : la duplication n'est appliquee qu'a l'etablissement de l'utilisateur
-- (les ecoles de demonstration restent sur les modeles). Les nouvelles ecoles
-- sont dupliquees a l'inscription (services/onboarding.ts).

-- -----------------------------------------------------------------------------
-- 1. Unicite : un code de role par etablissement, un par modele
-- -----------------------------------------------------------------------------

create unique index if not exists roles_system_code_key on roles (code) where school_id is null;
create unique index if not exists roles_school_code_key on roles (school_id, code) where school_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Nouvelle permission et signature du bulletin
-- -----------------------------------------------------------------------------

insert into permissions (code, module, action, description)
values ('reports.sign', 'reports', 'sign', 'Signer les bulletins valides avant leur publication')
on conflict (code) do nothing;

alter table report_cards
  add column if not exists signed_by uuid references users(id) on delete set null,
  add column if not exists signed_at timestamptz;

-- -----------------------------------------------------------------------------
-- 3. Modeles systeme : noms, nouvelles fonctions, droits par defaut
-- -----------------------------------------------------------------------------

update roles set name = 'Fondateur',
  description = 'A créé l''établissement : tous les droits, non modifiables.'
  where school_id is null and code = 'SCHOOL_ADMIN';
update roles set name = 'Éducateur' where school_id is null and code = 'SUPERVISOR';

insert into roles (school_id, code, name, description, is_system, level) values
  (null, 'DEPUTY_DIRECTOR',     'Directeur adjoint',       'Seconde le directeur ; sans la facturation, les rôles ni la clôture d''année.', true, 'SCHOOL'),
  (null, 'HEAD_SUPERVISOR',     'Surveillant général',     'Responsable de la vie scolaire : absences, retards, discipline, transmission des accès.', true, 'SCHOOL'),
  (null, 'EDUCATION_INSPECTOR', 'Inspecteur d''éducation', 'Supérieur hiérarchique des éducateurs : supervise et valide leur travail.', true, 'SCHOOL'),
  (null, 'IT_ADMIN',            'Informaticien',           'Comptes et accès, sans accès aux notes ni aux bulletins.', true, 'SCHOOL')
on conflict (code) where school_id is null do nothing;

-- Directeur adjoint = tout, moins ce qui engage l'etablissement.
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'
from roles r cross join permissions p
where r.school_id is null and r.code = 'DEPUTY_DIRECTOR'
  and not p.is_platform_only
  and p.code <> all (array[
    'billing.manage', 'users.assign_roles', 'users.create', 'users.update', 'users.disable',
    'academic_years.close', 'academic_years.reopen', 'reports.sign',
    'settings.update', 'settings.manage_branding',
    'teachers.delete', 'classes.delete', 'subjects.delete', 'rooms.delete', 'students.delete'
  ])
on conflict do nothing;

-- Surveillant general = Educateur + quelques droits de coordination.
insert into role_permissions (role_id, permission_id, default_scope)
select hs.id, rp.permission_id, rp.default_scope
from roles hs, roles sup, role_permissions rp
where hs.school_id is null and hs.code = 'HEAD_SUPERVISOR'
  and sup.school_id is null and sup.code = 'SUPERVISOR' and rp.role_id = sup.id
on conflict do nothing;
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'
from roles r cross join permissions p
where r.school_id is null and r.code = 'HEAD_SUPERVISOR'
  and p.code = any (array['announcements.create', 'access_accounts.bulk_send', 'teachers.view', 'reports.view'])
on conflict do nothing;

-- Inspecteur d'education = Surveillant general + supervision.
insert into role_permissions (role_id, permission_id, default_scope)
select ins.id, rp.permission_id, rp.default_scope
from roles ins, roles hs, role_permissions rp
where ins.school_id is null and ins.code = 'EDUCATION_INSPECTOR'
  and hs.school_id is null and hs.code = 'HEAD_SUPERVISOR' and rp.role_id = hs.id
on conflict do nothing;
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'
from roles r cross join permissions p
where r.school_id is null and r.code = 'EDUCATION_INSPECTOR'
  and p.code = any (array[
    'announcements.publish', 'grades.view_all', 'assessments.view',
    'access_accounts.reset', 'access_accounts.disable', 'access_accounts.reactivate'
  ])
on conflict do nothing;

-- Informaticien : comptes et acces, consultation de la structure, audit.
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'
from roles r cross join permissions p
where r.school_id is null and r.code = 'IT_ADMIN'
  and p.code = any (array[
    'access_accounts.view', 'access_accounts.create', 'access_accounts.send', 'access_accounts.bulk_send',
    'access_accounts.resend', 'access_accounts.reset', 'access_accounts.disable', 'access_accounts.reactivate',
    'access_accounts.view_history', 'users.view', 'users.create', 'users.update', 'users.disable',
    'students.view', 'teachers.view', 'classes.view', 'subjects.view', 'rooms.view',
    'academic_years.view', 'cycles.view', 'levels.view', 'schedule.view', 'announcements.view', 'audit.view'
  ])
on conflict do nothing;

-- Signature : Directeur et Fondateur par defaut (modifiable ensuite par etablissement).
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'
from roles r cross join permissions p
where r.school_id is null and r.code in ('DIRECTOR', 'SCHOOL_ADMIN') and p.code = 'reports.sign'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 4. Duplication des roles par etablissement
-- -----------------------------------------------------------------------------

-- Idempotente. Duplique les modeles (hors Parent, Eleve, Comptable) et rattache
-- les membres qui portaient encore le modele a la copie de leur etablissement.
create or replace function app.ensure_school_roles(p_school uuid)
returns integer
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  t record;
  v_role uuid;
  v_created integer := 0;
begin
  -- Duplication interne : les garde-fous de la section 5 (concus pour les actions d'un
  -- utilisateur) ne s'appliquent pas a la copie des modeles. Drapeau local a la transaction.
  perform set_config('app.roles_provisioning', 'on', true);
  for t in
    select * from public.roles
    where school_id is null and is_system and code not in ('PARENT', 'STUDENT', 'ACCOUNTANT')
  loop
    select id into v_role from public.roles where school_id = p_school and code = t.code;
    if v_role is null then
      insert into public.roles (school_id, code, name, description, is_system, level)
      values (p_school, t.code, t.name, t.description, false, t.level)
      returning id into v_role;
      insert into public.role_permissions (role_id, permission_id, default_scope)
      select v_role, rp.permission_id, rp.default_scope from public.role_permissions rp where rp.role_id = t.id;
      v_created := v_created + 1;
    end if;

    update public.membership_roles mr
    set role_id = v_role
    from public.school_memberships m
    where m.id = mr.membership_id and m.school_id = p_school and mr.role_id = t.id
      and not exists (
        select 1 from public.membership_roles x where x.membership_id = mr.membership_id and x.role_id = v_role
      );
  end loop;
  perform set_config('app.roles_provisioning', 'off', true);
  return v_created;
end;
$$;
revoke all on function app.ensure_school_roles(uuid) from public, anon, authenticated;

-- Appel serveur (inscription d'un etablissement) : service_role uniquement.
create or replace function public.ensure_school_roles(p_school uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$ select app.ensure_school_roles(p_school); $$;
revoke all on function public.ensure_school_roles(uuid) from public, anon, authenticated;
grant execute on function public.ensure_school_roles(uuid) to service_role;

-- Appel par le fondateur (bouton « Personnaliser les roles »).
create or replace function public.customize_roles(p_school uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_write(p_school, 'users.assign_roles') then
    raise exception 'Droit insuffisant pour personnaliser les roles.' using errcode = '42501';
  end if;
  return app.ensure_school_roles(p_school);
end;
$$;
revoke all on function public.customize_roles(uuid) from public, anon;
grant execute on function public.customize_roles(uuid) to authenticated;

-- Modification des droits d'un role : atomique, sous RLS et garde-fous (INVOKER).
create or replace function public.set_role_permissions(p_role uuid, p_add text[], p_remove text[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_scope scope_type;
begin
  select coalesce((select default_scope from role_permissions where role_id = p_role limit 1), 'SCHOOL') into v_scope;

  delete from role_permissions rp
  using permissions p
  where rp.role_id = p_role and p.id = rp.permission_id and p.code = any (coalesce(p_remove, '{}'));

  insert into role_permissions (role_id, permission_id, default_scope)
  select p_role, p.id, v_scope
  from permissions p
  where p.code = any (coalesce(p_add, '{}')) and not p.is_platform_only
  on conflict do nothing;

  update roles set updated_at = now() where id = p_role;
end;
$$;
revoke all on function public.set_role_permissions(uuid, text[], text[]) from public, anon;
grant execute on function public.set_role_permissions(uuid, text[], text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Garde-fous (service role et Super Admin : aucun blocage)
-- -----------------------------------------------------------------------------

-- Le role Fondateur d'un etablissement : ni renomme, ni supprime, ni recree.
create or replace function app.guard_roles()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
begin
  if current_setting('app.roles_provisioning', true) = 'on' then
    return coalesce(new, old);
  end if;
  if auth.uid() is null or app.is_platform_admin() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and new.code = 'SCHOOL_ADMIN' then
    raise exception 'Le role Fondateur ne peut pas etre cree.' using errcode = '42501';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.code = 'SCHOOL_ADMIN' then
    raise exception 'Le role Fondateur ne peut etre ni modifie ni supprime.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.code is distinct from old.code then
    raise exception 'Le code d''un role ne peut pas etre modifie.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists roles_guard on roles;
create trigger roles_guard before insert or update or delete on roles
  for each row execute function app.guard_roles();

-- Droits d'un role : Fondateur intouchable, et pas d'auto-promotion.
create or replace function app.guard_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_role public.roles;
  v_code text;
begin
  if current_setting('app.roles_provisioning', true) = 'on' then
    return coalesce(new, old);
  end if;
  if auth.uid() is null or app.is_platform_admin() then
    return coalesce(new, old);
  end if;
  select * into v_role from public.roles where id = coalesce(new.role_id, old.role_id);
  if v_role.school_id is not null and v_role.code = 'SCHOOL_ADMIN' then
    raise exception 'Le role Fondateur est complet et ne peut pas etre modifie.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and v_role.school_id is not null then
    select code into v_code from public.permissions where id = new.permission_id;
    if not app.has_permission(v_role.school_id, v_code) then
      raise exception 'Vous ne pouvez pas accorder un droit que vous ne possedez pas (%).', v_code
        using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists role_permissions_guard on role_permissions;
create trigger role_permissions_guard before insert or delete on role_permissions
  for each row execute function app.guard_role_permissions();

-- Attribution d'une fonction : jamais celle du Fondateur, jamais une fonction qui
-- contient un droit que l'auteur ne possede pas.
create or replace function app.guard_membership_roles()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_role public.roles;
  v_school uuid;
  v_missing text;
begin
  if current_setting('app.roles_provisioning', true) = 'on' then
    return coalesce(new, old);
  end if;
  if auth.uid() is null or app.is_platform_admin() then
    return coalesce(new, old);
  end if;
  select * into v_role from public.roles where id = coalesce(new.role_id, old.role_id);
  if v_role.code = 'SCHOOL_ADMIN' then
    raise exception 'Le role Fondateur ne peut etre ni attribue ni retire.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    select school_id into v_school from public.school_memberships where id = new.membership_id;
    select p.code into v_missing
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = new.role_id and not app.has_permission(v_school, p.code)
    limit 1;
    if v_missing is not null then
      raise exception 'Vous ne pouvez pas attribuer une fonction qui contient un droit que vous ne possedez pas (%).', v_missing
        using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists membership_roles_guard on membership_roles;
create trigger membership_roles_guard before insert or delete on membership_roles
  for each row execute function app.guard_membership_roles();

-- -----------------------------------------------------------------------------
-- 6. Bulletin : une permission par etape, appliquee en base
-- -----------------------------------------------------------------------------

-- Jusqu'ici la mise a jour exigeait `reports.validate` pour TOUT (valider, publier) :
-- cocher « publier » seul n'aurait rien change. Elle accepte maintenant les quatre
-- droits du bulletin, et le declencheur ci-dessous exige le bon droit par etape.
drop policy if exists report_cards_update on report_cards;
create policy report_cards_update on report_cards for update to authenticated
using (
  app.can_write(school_id, 'reports.generate') or app.can_write(school_id, 'reports.validate')
  or app.can_write(school_id, 'reports.sign') or app.can_write(school_id, 'reports.publish')
)
with check (
  app.can_write(school_id, 'reports.generate') or app.can_write(school_id, 'reports.validate')
  or app.can_write(school_id, 'reports.sign') or app.can_write(school_id, 'reports.publish')
);

create or replace function app.guard_report_card_update()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_perm text;
  v_ignored text[] := array['status', 'signed_at', 'signed_by', 'published_at', 'updated_at'];
begin
  if auth.uid() is null or app.is_platform_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    v_perm := case
      when new.status = 'PUBLISHED' then 'reports.publish'
      when new.status = 'VALIDATED' and old.status = 'PUBLISHED' then 'reports.publish'
      when new.status = 'GENERATED' then 'reports.generate'
      else 'reports.validate'
    end;
    if not app.has_permission(new.school_id, v_perm) then
      raise exception 'Droit requis pour cette etape du bulletin : %.', v_perm using errcode = '42501';
    end if;
    if new.status = 'PUBLISHED' and new.signed_at is null then
      raise exception 'Le bulletin doit etre signe avant sa publication.' using errcode = '23514';
    end if;
  end if;

  if new.signed_at is not null and (new.signed_at is distinct from old.signed_at or new.signed_by is distinct from old.signed_by) then
    if not app.has_permission(new.school_id, 'reports.sign') then
      raise exception 'Droit requis pour signer un bulletin : reports.sign.' using errcode = '42501';
    end if;
    if new.signed_by is distinct from auth.uid() then
      raise exception 'La signature doit porter l''identite de la personne qui signe.' using errcode = '42501';
    end if;
  end if;

  -- Toute autre colonne (moyennes, rang, appreciations) releve de la generation.
  if (to_jsonb(new) - v_ignored) is distinct from (to_jsonb(old) - v_ignored)
     and not app.has_permission(new.school_id, 'reports.generate') then
    raise exception 'Droit requis pour modifier le contenu d''un bulletin : reports.generate.' using errcode = '42501';
  end if;

  return new;
end;
$$;
drop trigger if exists report_cards_guard on report_cards;
create trigger report_cards_guard before update on report_cards
  for each row execute function app.guard_report_card_update();

-- -----------------------------------------------------------------------------
-- 7. Signal en direct quand les droits changent
-- -----------------------------------------------------------------------------

-- Les menus et pages se mettent a jour sans rechargement des qu'un role est
-- modifie ou qu'une fonction est attribuee (complete 0049, meme canal prive).
create or replace function app.live_notify_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s uuid;
begin
  for s in
    select distinct r.school_id from changed c join public.roles r on r.id = c.role_id where r.school_id is not null
  loop
    perform realtime.send(
      jsonb_build_object('table', 'role_permissions', 'op', 'PERMISSIONS'), 'changed', 'school:' || s::text, true
    );
  end loop;
  return null;
end;
$$;

create or replace function app.live_notify_membership_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s uuid;
begin
  for s in
    select distinct m.school_id from changed c join public.school_memberships m on m.id = c.membership_id
  loop
    perform realtime.send(
      jsonb_build_object('table', 'membership_roles', 'op', 'ROLES'), 'changed', 'school:' || s::text, true
    );
  end loop;
  return null;
end;
$$;
revoke all on function app.live_notify_role_permissions() from public, anon, authenticated;
revoke all on function app.live_notify_membership_roles() from public, anon, authenticated;

drop trigger if exists live_notify_ins on role_permissions;
create trigger live_notify_ins after insert on role_permissions
  referencing new table as changed for each statement execute function app.live_notify_role_permissions();
drop trigger if exists live_notify_del on role_permissions;
create trigger live_notify_del after delete on role_permissions
  referencing old table as changed for each statement execute function app.live_notify_role_permissions();
drop trigger if exists live_notify_ins on membership_roles;
create trigger live_notify_ins after insert on membership_roles
  referencing new table as changed for each statement execute function app.live_notify_membership_roles();
drop trigger if exists live_notify_del on membership_roles;
create trigger live_notify_del after delete on membership_roles
  referencing old table as changed for each statement execute function app.live_notify_membership_roles();

-- -----------------------------------------------------------------------------
-- 8. Donnees : uniquement l'etablissement de l'utilisateur
-- -----------------------------------------------------------------------------

do $$
declare
  s uuid;
begin
  for s in select id from schools where slug = 'lycee-d-excellence-de-yopougon-maroc' loop
    perform app.ensure_school_roles(s);
  end loop;
end $$;
