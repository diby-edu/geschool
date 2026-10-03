-- =============================================================================
-- 0088 — Les reglages de la PLATEFORME, pas d'un etablissement
--
-- Jusqu'ici, tout reglage appartenait a une ecole (school_settings). Mais
-- certaines decisions sont celles de l'editeur et valent pour tout le monde :
-- le prix d'un SMS, le nom d'expediteur de secours, l'adresse a qui envoyer les
-- dossiers de validation.
--
-- Meme forme que school_settings — un espace, un objet JSON — pour que la
-- lecture et l'ecriture se ressemblent des deux cotes.
-- =============================================================================

create table platform_settings (
  namespace  text primary key,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null,

  constraint platform_settings_is_object check (jsonb_typeof(settings) = 'object')
);

create trigger platform_settings_touch before update on platform_settings
  for each row execute function app.touch_updated_at();

alter table platform_settings enable row level security;
alter table platform_settings force  row level security;

-- Personne d'autre que l'administration de la plateforme. Pas meme en lecture :
-- le prix d'achat d'un SMS ne regarde pas les etablissements.
create policy platform_settings_select on platform_settings for select to authenticated
using (app.is_platform_admin());

create policy platform_settings_insert on platform_settings for insert to authenticated
with check (app.is_platform_admin());

create policy platform_settings_update on platform_settings for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());

comment on table platform_settings is
  'Reglages de l''editeur, communs a tous les etablissements. Lisibles des seuls administrateurs de la plateforme.';

-- -----------------------------------------------------------------------------
-- Ce qu'un etablissement a le droit de savoir
--
-- Une ecole ne lit pas platform_settings — le prix d'achat d'un SMS ne la
-- regarde pas. Mais elle doit connaitre le nom d'expediteur qu'elle emprunte,
-- et le prix qu'on lui facture. On expose donc ces deux valeurs, et elles
-- seules, plutot que de contourner les regles d'acces avec une cle de service.
-- -----------------------------------------------------------------------------

create or replace function app.platform_sms_public()
returns table(fallback_sender text, price_per_sms numeric)
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select coalesce(ps.settings->>'fallbackSender', '')::text,
         coalesce((ps.settings->>'pricePerSms')::numeric, 0)
  from public.platform_settings ps
  where ps.namespace = 'sms';
$$;

create or replace function platform_sms_public()
returns table(fallback_sender text, price_per_sms numeric)
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select * from app.platform_sms_public();
$$;

grant execute on function platform_sms_public() to authenticated;

comment on function app.platform_sms_public() is
  'Le nom d''expediteur prete par la plateforme et le prix facture. Le reste des reglages de l''editeur reste prive.';
