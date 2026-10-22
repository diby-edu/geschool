-- =============================================================================
-- 0132 — Fonctions propres à chaque école, d'office ; Comptable recentré
-- =============================================================================
-- Décidé le 2026-10-18.
--
-- 1. Comptable : par défaut, la paie des enseignants, la CONSULTATION de
--    l'abonnement et les annonces. Plus « Gérer l'abonnement » (choisir les
--    modules, payer) ni « Consulter les fiches des élèves » : la paie n'en a
--    pas besoin. Le fondateur peut les recocher.
--    Les copies d'école créées par 0128 et jamais modifiées depuis suivent le
--    modèle ; une copie qu'une école a déjà réglée n'est pas touchée.
--
-- 2. Chaque école a SA copie des fonctions dès sa création, quel que soit le
--    chemin (inscription, scripts) : « Rôles et droits » s'ouvre avec des
--    cases à cocher, sans passer par « Personnaliser les rôles ». L'inscription
--    le faisait déjà ; deux écoles créées par script n'en avaient pas.
--    Une école qui a déjà sa copie la garde telle quelle (ensure_school_roles
--    ne crée que ce qui manque).
-- =============================================================================

-- 1. Comptable ------------------------------------------------------------------
do $$
declare
  v_old text[] := array['announcements.view', 'billing.manage', 'billing.view', 'students.view', 'teachers.payroll'];
  r record;
begin
  -- Écriture interne : les garde-fous de 0050 visent les actions d'un utilisateur.
  perform set_config('app.roles_provisioning', 'on', true);

  for r in
    select ro.id
    from public.roles ro
    where ro.code = 'ACCOUNTANT'
      and (
        ro.school_id is null
        -- copie d'école restée identique à l'ancien modèle (0128)
        or (select array_agg(p.code order by p.code)
            from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
            where rp.role_id = ro.id) = v_old
      )
  loop
    delete from public.role_permissions rp
    using public.permissions p
    where rp.role_id = r.id and p.id = rp.permission_id and p.code in ('billing.manage', 'students.view');
  end loop;

  perform set_config('app.roles_provisioning', 'off', true);
end;
$$;

update public.roles set description = 'Heures faites et paie à l''heure des enseignants ; consulte l''abonnement. Ses droits se règlent comme pour toute fonction.'
where school_id is null and code = 'ACCOUNTANT';

-- 2. Une copie des fonctions pour chaque école, dès sa création ------------------
create or replace function app.schools_after_insert_roles()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
begin
  perform app.ensure_school_roles(new.id);
  return new;
end;
$$;

drop trigger if exists schools_roles_on_create on public.schools;
create trigger schools_roles_on_create after insert on public.schools
  for each row execute function app.schools_after_insert_roles();

-- Les écoles existantes qui n'en ont pas encore (les membres passent sur la copie).
select app.ensure_school_roles(s.id)
from public.schools s
where not exists (select 1 from public.roles r where r.school_id = s.id);
