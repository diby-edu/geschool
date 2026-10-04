-- =============================================================================
-- 0095 — Qui peut lire le quota de SMS
--
-- 0094 a ouvert `public.sms_quota(uuid)` sans garde : la fonction etant
-- SECURITY DEFINER, n'importe quel appelant — y compris `anon`, qui herite du
-- droit d'execution par defaut de PostgreSQL — pouvait lire la consommation
-- d'un etablissement dont il connaissait l'identifiant. Trois nombres, mais
-- trois nombres qui ne le concernent pas.
--
-- On referme :
--   - `sms_quota(uuid)`          : les MEMBRES de l'ecole, et la plateforme ;
--   - `sms_quota_internal(uuid)` : le systeme seul, pour decider d'un envoi
--                                  avant qu'il ne parte (aucune session
--                                  utilisateur a ce moment-la).
-- =============================================================================

create or replace function sms_quota(p_school uuid)
returns table(included integer, granted integer, used integer)
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select q.included, q.granted, q.used
  from app.sms_quota(p_school) q
  where app.is_platform_admin() or app.is_member_of(p_school);
$$;

revoke execute on function sms_quota(uuid) from public;
revoke execute on function sms_quota(uuid) from anon;
grant  execute on function sms_quota(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- La version du systeme
--
-- Appelee juste avant un envoi, depuis une tache de fond : il n'y a alors
-- aucun utilisateur pour porter un droit. Reservee a service_role, donc
-- inaccessible depuis un navigateur.
-- -----------------------------------------------------------------------------

create or replace function sms_quota_internal(p_school uuid)
returns table(included integer, granted integer, used integer)
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select * from app.sms_quota(p_school);
$$;

revoke execute on function sms_quota_internal(uuid) from public;
revoke execute on function sms_quota_internal(uuid) from anon;
revoke execute on function sms_quota_internal(uuid) from authenticated;
grant  execute on function sms_quota_internal(uuid) to service_role;

comment on function sms_quota(uuid) is
  'Quota du mois, pour les membres de l''ecole : inclus, complement accorde, consommation.';
comment on function sms_quota_internal(uuid) is
  'Meme quota, sans garde d''acces : reserve a service_role, pour decider d''un envoi hors session.';
