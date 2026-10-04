-- =============================================================================
-- 0094 — Le quota de SMS
--
-- Jusqu'ici l'application MESURAIT le cout des SMS sans jamais le facturer :
-- l'editeur payait l'operateur, et rien ne l'en dedommageait. Une ecole qui
-- cochait les alertes SMS pour mille familles pouvait couter cher sans
-- prevenir personne.
--
-- Le modele retenu : un nombre de SMS INCLUS par mois, puis BLOCAGE. Pas de
-- facture surprise — ni pour l'ecole, ni pour l'editeur. L'ecole qui veut plus
-- achete un complement, que l'editeur accorde ici.
--
-- D'ou vient le quota, dans cet ordre :
--   1. le complement accorde pour le mois (cette table) ;
--   2. le quota de la FORMULE souscrite (plans.limits -> smsPerMonth) ;
--   3. le quota par defaut de la plateforme (platform_settings).
--
-- CE QUI N'EST JAMAIS BLOQUE : les identifiants de connexion. Un quota epuise
-- ne doit pas empecher un enseignant de recevoir ses codes — ce serait punir
-- l'ecole deux fois.
-- =============================================================================

create table sms_quota_grants (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  -- Le premier jour du mois couvert : 2026-10-01 pour octobre.
  covers_month date not null,
  quantity    integer not null,
  reason      text,
  granted_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint sms_quota_quantity check (quantity > 0 and quantity <= 100000),
  -- Un seul complement par ecole et par mois : on modifie le nombre plutot
  -- que d'empiler des lignes dont personne ne ferait la somme de tete.
  unique (school_id, covers_month)
);

create index sms_quota_grants_school_idx on sms_quota_grants (school_id, covers_month desc);

alter table sms_quota_grants enable row level security;
alter table sms_quota_grants force  row level security;

-- L'ecole VOIT son complement — c'est ce qu'elle a paye — mais ne l'accorde
-- pas : seule la plateforme ecrit ici.
create policy sms_quota_select on sms_quota_grants for select to authenticated
using (
  app.is_platform_admin()
  or school_id in (select app.my_schools_with('settings.update'))
);

create policy sms_quota_insert on sms_quota_grants for insert to authenticated
with check (app.is_platform_admin());

create policy sms_quota_update on sms_quota_grants for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy sms_quota_delete on sms_quota_grants for delete to authenticated
using (app.is_platform_admin());

-- -----------------------------------------------------------------------------
-- Le quota effectif d'une ecole pour le mois en cours
--
-- Expose aux etablissements : une ecole doit savoir combien il lui reste, sans
-- pouvoir lire le reste des reglages de l'editeur.
-- -----------------------------------------------------------------------------

create or replace function app.sms_quota(p_school uuid)
returns table(included integer, granted integer, used integer)
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  with mois as (
    select date_trunc('month', now())::date as debut
  ),
  formule as (
    select coalesce((p.limits->>'smsPerMonth')::integer, null) as q
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.school_id = p_school and s.status in ('ACTIVE', 'TRIALING')
    order by s.created_at desc
    limit 1
  ),
  defaut as (
    select coalesce((ps.settings->>'monthlyQuota')::integer, 0) as q
    from public.platform_settings ps where ps.namespace = 'sms'
  )
  select
    coalesce((select q from formule), (select q from defaut), 0)::integer,
    coalesce((
      select g.quantity from public.sms_quota_grants g, mois m
      where g.school_id = p_school and g.covers_month = m.debut
    ), 0)::integer,
    coalesce((
      select sum(sm.parts)::integer from public.sms_messages sm, mois m
      where sm.school_id = p_school
        and sm.created_at >= m.debut
        and sm.status <> 'FAILED'
    ), 0)::integer;
$$;

create or replace function sms_quota(p_school uuid)
returns table(included integer, granted integer, used integer)
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select * from app.sms_quota(p_school);
$$;

grant execute on function sms_quota(uuid) to authenticated;

comment on table sms_quota_grants is
  'SMS accordes en plus du quota de la formule, pour un mois donne. Ecrits par la plateforme seule.';
comment on function app.sms_quota(uuid) is
  'Quota du mois : inclus par la formule, complement accorde, et consommation reelle (SMS factures).';
