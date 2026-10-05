-- =============================================================================
-- 0103 — Ou l'ecole verse son abonnement
--
-- Tant qu'aucune passerelle Mobile Money n'est branchee, une ecole paie hors
-- ligne : elle verse sur le numero de l'editeur et signale la reference. Encore
-- faut-il qu'elle CONNAISSE ce numero — sans quoi « payer » ne veut rien dire.
--
-- Range avec les autres reglages de l'editeur (platform_settings, 0088), que
-- les ecoles ne peuvent pas lire. Cette fonction en expose exactement ce qu'il
-- leur faut, et rien de plus.
-- =============================================================================

create or replace function app.platform_payment_public()
returns table(provider text, mobile_money_number text, mobile_money_name text, instructions text)
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select
    coalesce(ps.settings->>'provider', ''),
    coalesce(ps.settings->>'mobileMoneyNumber', ''),
    coalesce(ps.settings->>'mobileMoneyName', ''),
    coalesce(ps.settings->>'instructions', '')
  from public.platform_settings ps
  where ps.namespace = 'billing';
$$;

create or replace function platform_payment_public()
returns table(provider text, mobile_money_number text, mobile_money_name text, instructions text)
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select * from app.platform_payment_public();
$$;

revoke execute on function platform_payment_public() from public;
revoke execute on function platform_payment_public() from anon;
grant  execute on function platform_payment_public() to authenticated;

comment on function platform_payment_public() is
  'Ce qu''une ecole doit savoir pour payer : passerelle ouverte ou non, et ou verser en attendant.';
