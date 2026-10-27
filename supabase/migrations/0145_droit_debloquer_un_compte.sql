-- =============================================================================
-- 0145 — Droit « Débloquer un compte »
-- =============================================================================
--
-- Décidé le 2026-10-26 : après 5 essais ratés en 15 minutes, un compte est
-- bloqué (0047). Le Super Admin n'a pas le temps de débloquer tout le monde :
-- c'est l'Informaticien de l'école qui règle ces problèmes. Le droit se coche
-- ou se décoche comme les autres ; par défaut : Fondateur et Informaticien.
--
-- Débloquer = effacer les essais ratés du compte (table login_attempts, que
-- seul service_role lit et écrit) : le serveur vérifie le droit avant.
-- =============================================================================

insert into permissions (code, module, action, description, is_platform_only) values
  ('access_accounts.unlock', 'access_accounts', 'unlock', 'Debloquer un compte apres des essais rates', false)
on conflict (code) do nothing;

with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on r.code = any (array['SCHOOL_ADMIN', 'IT_ADMIN'])
  where p.code = 'access_accounts.unlock'
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;
