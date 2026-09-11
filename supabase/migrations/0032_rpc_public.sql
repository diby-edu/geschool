-- =============================================================================
-- 0032 — Passerelles RPC dans le schema public
-- =============================================================================
--
-- PROBLEME  Le client @supabase/supabase-js appelle supabase.rpc('nom') en
--           cherchant public.nom : PostgREST n'expose que le schema public.
--           Les fonctions vivent dans app.*, donc getTenantContext() recevait
--           null pour is_platform_admin / my_role_codes / my_permission_codes
--           -> roles vides (« Membre »), permissions vides (mauvaise vue de
--           tableau de bord), et un Super Admin qui n'etait pas reconnu.
--
--           Symptome silencieux : aucune erreur cote client, juste des droits
--           manquants. Exactement le genre de faille que seule une verification
--           de bout en bout revele.
--
-- CORRECTIF Fines passerelles dans public, appelant les fonctions app.*.
--           Elles n'exposent que ce dont la couche applicative a besoin.
--           SECURITY INVOKER : elles n'ont aucun privilege propre, le travail
--           reste fait par les fonctions app.* (SECURITY DEFINER).
--
-- On n'expose PAS le schema app entier a PostgREST : seules ces trois fonctions
-- deviennent joignables, la surface reste minimale.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select app.is_platform_admin(); $$;

create or replace function public.my_role_codes(p_school uuid)
returns text[]
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select app.my_role_codes(p_school); $$;

create or replace function public.my_permission_codes(p_school uuid)
returns text[]
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select app.my_permission_codes(p_school); $$;

revoke all on function
  public.is_platform_admin(),
  public.my_role_codes(uuid),
  public.my_permission_codes(uuid)
from public;

grant execute on function
  public.is_platform_admin(),
  public.my_role_codes(uuid),
  public.my_permission_codes(uuid)
to authenticated, service_role;
