-- =============================================================================
-- 0093 — Le seuil de confirmation, lisible par les ecoles
--
-- `platform_settings` est ferme aux etablissements : le prix d'achat d'un SMS
-- ne les regarde pas. Mais le montant au-dela duquel l'application demande une
-- confirmation, si : c'est leur argent, et l'ecran doit pouvoir le leur dire
-- avant qu'elles cliquent.
--
-- On expose donc cette valeur seule, comme on avait expose le nom d'expediteur
-- prete et le prix facture (0088).
-- =============================================================================

create or replace function app.platform_sms_confirm_above()
returns numeric
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select coalesce((ps.settings->>'confirmAboveAmount')::numeric, 5000)
  from public.platform_settings ps
  where ps.namespace = 'sms';
$$;

create or replace function platform_sms_confirm_above()
returns numeric
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select app.platform_sms_confirm_above();
$$;

grant execute on function platform_sms_confirm_above() to authenticated;

comment on function app.platform_sms_confirm_above() is
  'Montant au-dela duquel un envoi groupe demande confirmation. Le reste des reglages de l''editeur reste prive.';
