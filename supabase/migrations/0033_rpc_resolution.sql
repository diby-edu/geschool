-- =============================================================================
-- 0033 — Passerelle publique pour la resolution d'identifiant
-- =============================================================================
--
-- Meme cause que 0032 : app.resolve_login_email n'est pas joignable via
-- supabase.rpc(), qui cherche dans public. La connexion par telephone ou
-- matricule echouait donc a la resolution.
--
-- Reservee a service_role : elle s'execute AVANT authentification (le client
-- admin l'appelle) et ne doit jamais etre joignable par un role authenticated
-- ou anon — un utilisateur connecte n'a aucune raison de resoudre un
-- identifiant, et anon pourrait s'en servir pour enumerer les comptes.

create or replace function public.resolve_login_email(p_school uuid, p_identifier text)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select app.resolve_login_email(p_school, p_identifier); $$;

revoke all on function public.resolve_login_email(uuid, text) from public, authenticated, anon;
grant execute on function public.resolve_login_email(uuid, text) to service_role;
