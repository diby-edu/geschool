-- =============================================================================
-- 0006 — RLS du noyau : etablissements, utilisateurs, RBAC
-- =============================================================================
--
-- FORCE ROW LEVEL SECURITY en plus de ENABLE : sans FORCE, le proprietaire de
-- la table (postgres) echappe aux policies. Avec, seul service_role — qui a
-- l'attribut BYPASSRLS — passe outre, et son usage est cantonne (ADR-013).

-- -----------------------------------------------------------------------------
-- schools
-- -----------------------------------------------------------------------------

alter table schools enable row level security;
alter table schools force  row level security;

create policy schools_select on schools for select to authenticated
using (app.is_platform_admin() or app.is_member_of(id));

create policy schools_insert on schools for insert to authenticated
with check (app.is_platform_admin());

create policy schools_update on schools for update to authenticated
using (
  app.is_platform_admin()
  or (app.is_member_of(id) and app.has_permission(id, 'settings.update'))
)
with check (
  app.is_platform_admin()
  or (app.is_member_of(id) and app.has_permission(id, 'settings.update'))
);

create policy schools_delete on schools for delete to authenticated
using (app.is_platform_admin());

-- -----------------------------------------------------------------------------
-- school_settings
--
-- Lecture ouverte a tout membre : les reglages pilotent le comportement de
-- l'application entiere (bareme, arrondi, jours ouvres). Exiger settings.view
-- pour les lire rendrait l'application inutilisable aux enseignants.
-- L'ecriture, elle, exige settings.update.
-- -----------------------------------------------------------------------------

alter table school_settings enable row level security;
alter table school_settings force  row level security;

create policy school_settings_select on school_settings for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy school_settings_insert on school_settings for insert to authenticated
with check (app.can_write(school_id, 'settings.update'));

create policy school_settings_update on school_settings for update to authenticated
using (app.can_write(school_id, 'settings.update'))
with check (app.can_write(school_id, 'settings.update'));

create policy school_settings_delete on school_settings for delete to authenticated
using (app.can_write(school_id, 'settings.update'));

-- -----------------------------------------------------------------------------
-- school_branding_templates
-- -----------------------------------------------------------------------------

alter table school_branding_templates enable row level security;
alter table school_branding_templates force  row level security;

create policy branding_select on school_branding_templates for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));

create policy branding_insert on school_branding_templates for insert to authenticated
with check (app.can_write(school_id, 'settings.manage_branding'));

create policy branding_update on school_branding_templates for update to authenticated
using (app.can_write(school_id, 'settings.manage_branding'))
with check (app.can_write(school_id, 'settings.manage_branding'));

create policy branding_delete on school_branding_templates for delete to authenticated
using (app.can_write(school_id, 'settings.manage_branding'));

-- -----------------------------------------------------------------------------
-- platform_admins
--
-- Un utilisateur peut constater qu'il est lui-meme Super Admin ; il ne peut pas
-- enumerer les autres. Toute ecriture est reservee aux Super Admins.
-- -----------------------------------------------------------------------------

alter table platform_admins enable row level security;
alter table platform_admins force  row level security;

create policy platform_admins_select on platform_admins for select to authenticated
using (app.is_platform_admin() or user_id = auth.uid());

create policy platform_admins_insert on platform_admins for insert to authenticated
with check (app.is_platform_admin());

create policy platform_admins_update on platform_admins for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy platform_admins_delete on platform_admins for delete to authenticated
using (app.is_platform_admin());

-- -----------------------------------------------------------------------------
-- users
--
-- Deux utilisateurs ne se voient que s'ils partagent un etablissement.
-- Chacun modifie son propre profil ; administrer celui d'autrui exige
-- users.update dans un etablissement commun.
-- -----------------------------------------------------------------------------

alter table users enable row level security;
alter table users force  row level security;

create policy users_select on users for select to authenticated
using (
  app.is_platform_admin()
  or id = auth.uid()
  or app.shares_school_with(id)
);

create policy users_insert on users for insert to authenticated
with check (app.is_platform_admin());

create policy users_update on users for update to authenticated
using (app.is_platform_admin() or id = auth.uid() or app.can_manage_user(id))
with check (app.is_platform_admin() or id = auth.uid() or app.can_manage_user(id));

create policy users_delete on users for delete to authenticated
using (app.is_platform_admin());

-- -----------------------------------------------------------------------------
-- school_memberships
-- -----------------------------------------------------------------------------

alter table school_memberships enable row level security;
alter table school_memberships force  row level security;

create policy memberships_select on school_memberships for select to authenticated
using (
  app.is_platform_admin()
  or user_id = auth.uid()
  or (app.is_member_of(school_id) and app.has_permission(school_id, 'users.view'))
);

create policy memberships_insert on school_memberships for insert to authenticated
with check (app.can_write(school_id, 'users.create'));

create policy memberships_update on school_memberships for update to authenticated
using (app.can_write(school_id, 'users.update'))
with check (app.can_write(school_id, 'users.update'));

create policy memberships_delete on school_memberships for delete to authenticated
using (app.can_write(school_id, 'users.disable'));

-- -----------------------------------------------------------------------------
-- roles
--
-- Les roles systeme (school_id NULL) sont lisibles par tous les utilisateurs
-- authentifies — ce sont des modeles, sans donnee sensible — mais modifiables
-- par le seul Super Admin.
-- -----------------------------------------------------------------------------

alter table roles enable row level security;
alter table roles force  row level security;

create policy roles_select on roles for select to authenticated
using (
  app.is_platform_admin()
  or school_id is null
  or app.is_member_of(school_id)
);

create policy roles_insert on roles for insert to authenticated
with check (
  app.is_platform_admin()
  or (school_id is not null and app.can_write(school_id, 'users.assign_roles'))
);

create policy roles_update on roles for update to authenticated
using (
  app.is_platform_admin()
  or (school_id is not null and not is_system and app.can_write(school_id, 'users.assign_roles'))
)
with check (
  app.is_platform_admin()
  or (school_id is not null and not is_system and app.can_write(school_id, 'users.assign_roles'))
);

create policy roles_delete on roles for delete to authenticated
using (
  app.is_platform_admin()
  or (school_id is not null and not is_system and app.can_write(school_id, 'users.assign_roles'))
);

-- -----------------------------------------------------------------------------
-- permissions — catalogue en lecture seule pour tous, ecriture plateforme
-- -----------------------------------------------------------------------------

alter table permissions enable row level security;
alter table permissions force  row level security;

create policy permissions_select on permissions for select to authenticated using (true);

create policy permissions_insert on permissions for insert to authenticated
with check (app.is_platform_admin());

create policy permissions_update on permissions for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy permissions_delete on permissions for delete to authenticated
using (app.is_platform_admin());

-- -----------------------------------------------------------------------------
-- role_permissions
--
-- Pas de school_id : le rattachement passe par le role. Un role systeme est
-- lisible par tous, un role d'etablissement par ses membres seulement.
-- -----------------------------------------------------------------------------

alter table role_permissions enable row level security;
alter table role_permissions force  row level security;

create policy role_permissions_select on role_permissions for select to authenticated
using (
  app.is_platform_admin()
  or exists (
    select 1 from roles r
    where r.id = role_permissions.role_id
      and (r.school_id is null or app.is_member_of(r.school_id))
  )
);

create policy role_permissions_insert on role_permissions for insert to authenticated
with check (
  app.is_platform_admin()
  or exists (
    select 1 from roles r
    where r.id = role_permissions.role_id
      and r.school_id is not null
      and not r.is_system
      and app.can_write(r.school_id, 'users.assign_roles')
  )
);

create policy role_permissions_update on role_permissions for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy role_permissions_delete on role_permissions for delete to authenticated
using (
  app.is_platform_admin()
  or exists (
    select 1 from roles r
    where r.id = role_permissions.role_id
      and r.school_id is not null
      and not r.is_system
      and app.can_write(r.school_id, 'users.assign_roles')
  )
);

-- -----------------------------------------------------------------------------
-- membership_roles
-- -----------------------------------------------------------------------------

alter table membership_roles enable row level security;
alter table membership_roles force  row level security;

create policy membership_roles_select on membership_roles for select to authenticated
using (
  app.is_platform_admin()
  or exists (
    select 1 from school_memberships m
    where m.id = membership_roles.membership_id
      and (m.user_id = auth.uid()
           or (app.is_member_of(m.school_id) and app.has_permission(m.school_id, 'users.view')))
  )
);

create policy membership_roles_insert on membership_roles for insert to authenticated
with check (
  exists (
    select 1 from school_memberships m
    where m.id = membership_roles.membership_id
      and app.can_write(m.school_id, 'users.assign_roles')
  )
  or app.is_platform_admin()
);

create policy membership_roles_update on membership_roles for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy membership_roles_delete on membership_roles for delete to authenticated
using (
  app.is_platform_admin()
  or exists (
    select 1 from school_memberships m
    where m.id = membership_roles.membership_id
      and app.can_write(m.school_id, 'users.assign_roles')
  )
);

-- -----------------------------------------------------------------------------
-- membership_scope_grants
-- -----------------------------------------------------------------------------

alter table membership_scope_grants enable row level security;
alter table membership_scope_grants force  row level security;

create policy scope_grants_select on membership_scope_grants for select to authenticated
using (
  app.is_platform_admin()
  or exists (
    select 1 from school_memberships m
    where m.id = membership_scope_grants.membership_id
      and (m.user_id = auth.uid()
           or (app.is_member_of(m.school_id) and app.has_permission(m.school_id, 'users.view')))
  )
);

create policy scope_grants_insert on membership_scope_grants for insert to authenticated
with check (
  app.is_platform_admin()
  or exists (
    select 1 from school_memberships m
    where m.id = membership_scope_grants.membership_id
      and app.can_write(m.school_id, 'users.assign_roles')
  )
);

create policy scope_grants_update on membership_scope_grants for update to authenticated
using (
  app.is_platform_admin()
  or exists (
    select 1 from school_memberships m
    where m.id = membership_scope_grants.membership_id
      and app.can_write(m.school_id, 'users.assign_roles')
  )
)
with check (
  app.is_platform_admin()
  or exists (
    select 1 from school_memberships m
    where m.id = membership_scope_grants.membership_id
      and app.can_write(m.school_id, 'users.assign_roles')
  )
);

create policy scope_grants_delete on membership_scope_grants for delete to authenticated
using (
  app.is_platform_admin()
  or exists (
    select 1 from school_memberships m
    where m.id = membership_scope_grants.membership_id
      and app.can_write(m.school_id, 'users.assign_roles')
  )
);

-- -----------------------------------------------------------------------------
-- Droits de table
--
-- La RLS ne s'applique qu'a ce qui est deja accessible : sans GRANT, une table
-- est simplement invisible. Les deux mecanismes sont complementaires.
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on
  schools, school_settings, school_branding_templates, platform_admins,
  users, school_memberships,
  roles, permissions, role_permissions, membership_roles, membership_scope_grants
to authenticated;
