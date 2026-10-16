-- =============================================================================
-- 0128 — Le Comptable redevient une fonction attribuable
-- =============================================================================
-- 0050 l'avait retiré (le produit ne gère pas l'argent des inscriptions). Depuis
-- 0116, la paie à l'heure des enseignants (droit teachers.payroll) lui est
-- donnée par défaut : décidé le 2026-10-16, le fondateur peut confier la
-- fonction Comptable à qui il veut et en régler les droits comme les autres.
--
--   1. La copie des fonctions par établissement inclut désormais le Comptable.
--   2. Chaque établissement qui a déjà ses fonctions reçoit sa copie du Comptable
--      (avec les droits du modèle : élèves, facturation, annonces, paie).
-- =============================================================================

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
  -- Duplication interne : les garde-fous (conçus pour les actions d'un utilisateur)
  -- ne s'appliquent pas à la copie des modèles. Drapeau local à la transaction.
  perform set_config('app.roles_provisioning', 'on', true);
  for t in
    select * from public.roles
    where school_id is null and is_system and code not in ('PARENT', 'STUDENT')
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

-- Description affichée dans « Rôles et droits ».
update roles set description = 'Heures faites et paie à l''heure des enseignants ; ses autres droits se règlent comme pour toute fonction.'
where school_id is null and code = 'ACCOUNTANT';

-- Les établissements qui ont déjà leurs fonctions reçoivent le Comptable.
select app.ensure_school_roles(s.id)
from schools s
where exists (select 1 from roles r where r.school_id = s.id);
