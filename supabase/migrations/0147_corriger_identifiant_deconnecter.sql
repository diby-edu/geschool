-- =============================================================================
-- 0147 — Droits « Corriger l'identifiant de connexion » et « Déconnecter partout »
-- =============================================================================
--
-- Décidé le 2026-10-26, comme « Débloquer » (0145) : ce sont des gestes de
-- l'Informaticien de l'école. Les droits se cochent ou se décochent comme les
-- autres ; par défaut : Fondateur et Informaticien. Le Super Admin peut aussi.
--
--   - access_accounts.change_login : la secrétaire s'est trompée de numéro, ou la
--     personne a changé de numéro ou d'e-mail ; on corrige son identifiant.
--   - access_accounts.sign_out : téléphone perdu ou volé ; on ferme toutes ses
--     connexions ouvertes (public.revoke_user_sessions, 0047).
--
-- Le serveur vérifie le droit avant d'agir (les écritures passent par le
-- client d'administration, après ce contrôle).
-- =============================================================================

insert into permissions (code, module, action, description, is_platform_only) values
  ('access_accounts.change_login', 'access_accounts', 'change_login', 'Corriger le numero ou l''e-mail de connexion', false),
  ('access_accounts.sign_out', 'access_accounts', 'sign_out', 'Deconnecter une personne de tous ses appareils', false)
on conflict (code) do nothing;

with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on r.code = any (array['SCHOOL_ADMIN', 'IT_ADMIN'])
  where p.code in ('access_accounts.change_login', 'access_accounts.sign_out')
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;
