-- =============================================================================
-- 0035 — Passerelle publique pour la sequence de matricule
-- =============================================================================
--
-- Meme cause que 0032/0033 : supabase.rpc() cherche dans public, la fonction
-- vit dans app. L'orchestration d'inscription appelle next_matricule_seq via
-- le client service_role.

create or replace function public.next_matricule_seq(p_school uuid, p_year uuid)
returns integer
language sql
security invoker
set search_path = public, pg_temp
as $$ select app.next_matricule_seq(p_school, p_year); $$;

revoke all on function public.next_matricule_seq(uuid, uuid) from public;
grant execute on function public.next_matricule_seq(uuid, uuid) to authenticated, service_role;
