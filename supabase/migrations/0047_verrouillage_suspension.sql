-- =============================================================================
-- 0047 — Verrouillage apres essais rates + suspension d'un acces
-- =============================================================================
--
-- 1. login_attempts : journal des CONNEXIONS RATEES, par cle (code ecole +
--    identifiant, ou email). Au-dela de 5 echecs en 15 minutes, la cle est
--    verrouillee. Le code ecole et le telephone ne sont pas des secrets : seul
--    le mot de passe protege le compte, donc on limite les essais. Les echecs
--    sont comptes que le compte existe ou non (aucune enumeration possible).
--
-- 2. Suspension : un acces suspendu (account_status = SUSPENDED) ne peut plus
--    se connecter. app.resolve_login_email ne renvoyait que les acces non
--    DESACTIVES ; elle exclut maintenant aussi les acces SUSPENDUS.
--
-- 3. public.revoke_user_sessions : coupe les sessions ouvertes d'un compte
--    suspendu (sinon un jeton deja emis resterait valable jusqu'a expiration).

create table login_attempts (
  id          uuid primary key default gen_random_uuid(),
  attempt_key text not null,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create index login_attempts_key_idx on login_attempts (attempt_key, created_at desc);

-- Table technique : seul service_role (src/features/auth/lockout.ts) y accede.
alter table login_attempts enable row level security;
alter table login_attempts force  row level security;

create policy login_attempts_none on login_attempts
for all to authenticated using (false) with check (false);

create or replace function app.resolve_login_email(
  p_school     uuid,
  p_identifier text
)
returns text
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select u.auth_email
  from public.account_access aa
  join public.users u on u.id = aa.user_id
  where aa.school_id = p_school
    and lower(aa.login_identifier) = lower(p_identifier)
    and aa.account_status not in ('DISABLED', 'SUSPENDED')
  limit 1;
$$;

create or replace function public.revoke_user_sessions(p_user uuid)
returns void
language sql
security definer
set search_path = auth, pg_temp
as $$
  delete from auth.sessions where user_id = p_user;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, authenticated, anon;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
