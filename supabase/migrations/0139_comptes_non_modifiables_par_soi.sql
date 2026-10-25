-- =============================================================================
-- 0139 — Son propre accès et son propre compte : seulement la photo
-- =============================================================================
-- Constaté le 2026-10-25, même famille que 0138. Avec sa seule session, tout
-- utilisateur pouvait écrire en base, sur lui-même :
--   - account_access : se réactiver (account_status), changer son identifiant
--     de connexion, remettre à zéro ses compteurs d'envois et de remises ;
--   - users : son statut (c'est lui qui désactive un compte), son e-mail de
--     connexion, son téléphone.
--
-- Ce que l'application écrit vraiment avec la session de la personne :
--   - users.avatar_url (photo de profil),
--   - users.last_login_at (dernière connexion).
-- Tout le reste passe par le serveur (services/, clé de service) : première
-- connexion, suspension, réactivation, envoi des identifiants. Aucune fonction
-- SQL ne modifie ces tables avec les droits de l'appelant.
-- =============================================================================

-- 1. Accès : le droit de gestion des accès, ou la plateforme ---------------------
drop policy account_access_update on account_access;
create policy account_access_update on account_access for update to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_writable_schools_with('access_accounts.reset'))
)
with check (
  (select app.is_platform_admin())
  or school_id in (select app.my_writable_schools_with('access_accounts.reset'))
);

-- 2. Comptes : par une session, seules la photo et la dernière connexion ---------
-- (la règle de lignes users_update ne change pas : soi-même, la plateforme, ou
-- qui gère cette personne ; ce sont les colonnes qui sont limitées.)
revoke update on public.users from authenticated;
grant update (avatar_url, last_login_at) on public.users to authenticated;
