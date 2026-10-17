-- =============================================================================
-- 0130 — Statistiques de la plateforme : des agrégats, plus des lignes brutes
-- =============================================================================
-- Le tableau de bord du Super Admin (src/features/platform-dashboard/stats.ts)
-- lisait des tables entières — students, payments, school_memberships,
-- audit_logs — puis comptait en mémoire. PostgREST plafonne CHAQUE réponse à
-- 1 000 lignes : dès la 1 001e, les chiffres devenaient faux sans message
-- (base de démo : ~5 600 élèves, le tableau en voyait 1 000).
--
-- Même défaut pour « écoles qui utilisent le module » : `select school_id
-- limit 5000` sur grades (560 000 lignes) rendait les 1 000 premières, souvent
-- toutes d'une seule école.
--
-- Trois fonctions, réservées au Super Admin, qui ne rendent jamais de lignes
-- brutes : une ligne par école, une ligne par mois, une ligne de totaux.
-- Toutes s'appuient sur les index qui commencent par school_id.
--
-- Au passage : l'ancienne lecture demandait `schools.disabled_features`, une
-- colonne qui n'existe pas (c'est une clé calculée par app_context, 0070) —
-- la requête échouait en entier et le tableau n'affichait aucune école.

-- Une ligne par école : effectifs, dernier signe de vie, modules qui ont
-- produit des données.
--
-- enable_seqscan = off, pour cette fonction seulement : avec peu d'écoles, le
-- planificateur croit trouver vite une ligne de grades en parcourant toute la
-- table (560 000 lignes, ~900 ms) au lieu d'interroger l'index (school_id, …)
-- (~13 ms, mesuré le 2026-10-16).
create or replace function public.platform_school_stats(p_since timestamptz)
returns table (
  school_id uuid,
  name text,
  slug text,
  status text,
  created_at timestamptz,
  disabled_modules integer,
  students integer,
  staff integer,
  last_seen timestamptz,
  modules_used text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set enable_seqscan = off
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme.' using errcode = '42501';
  end if;

  return query
  select s.id,
         s.name::text,
         s.slug::text,
         s.status::text,
         s.created_at,
         -- Modules coupés par la plateforme (school_features, 0070). Absent = actif.
         (select count(*) from public.school_features f
           where f.school_id = s.id and not f.is_enabled)::integer,
         (select count(*) from public.students st
           where st.school_id = s.id and st.deleted_at is null)::integer,
         (select count(*) from public.school_memberships m
           where m.school_id = s.id and m.status = 'ACTIVE')::integer,
         -- Le journal d'audit, pas access_events : il enregistre chaque geste
         -- réel, access_events seulement la vie des comptes.
         (select max(a.created_at) from public.audit_logs a
           where a.school_id = s.id and a.created_at >= p_since),
         array_remove(array[
           case when exists (select 1 from public.students x where x.school_id = s.id and x.deleted_at is null) then 'students' end,
           case when exists (select 1 from public.schedule_sessions x where x.school_id = s.id) then 'schedule_sessions' end,
           case when exists (select 1 from public.attendance_registers x where x.school_id = s.id) then 'attendance_registers' end,
           case when exists (select 1 from public.grades x where x.school_id = s.id) then 'grades' end,
           case when exists (select 1 from public.report_cards x where x.school_id = s.id) then 'report_cards' end,
           case when exists (select 1 from public.discipline_incidents x where x.school_id = s.id) then 'discipline_incidents' end,
           case when exists (select 1 from public.announcements x where x.school_id = s.id) then 'announcements' end
         ], null)
  from public.schools s;
end;
$$;

-- Une ligne par mois (UTC, « 2026-09 ») depuis p_since : écoles créées, élèves
-- inscrits (non supprimés), montants encaissés.
create or replace function public.platform_monthly_stats(p_since timestamptz)
returns table (month text, schools integer, students integer, revenue numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme.' using errcode = '42501';
  end if;

  return query
  with faits as (
    select to_char(s.created_at at time zone 'UTC', 'YYYY-MM') as mois, 1 as ecole, 0 as eleve, 0::numeric as montant
    from public.schools s
    where s.created_at >= p_since
    union all
    select to_char(st.created_at at time zone 'UTC', 'YYYY-MM'), 0, 1, 0
    from public.students st
    where st.created_at >= p_since and st.deleted_at is null
    union all
    select to_char(coalesce(p.paid_at, p.created_at) at time zone 'UTC', 'YYYY-MM'), 0, 0, p.amount
    from public.payments p
    where p.status::text in ('CONFIRMED', 'SETTLED', 'PAID')
      and coalesce(p.paid_at, p.created_at) >= p_since
  )
  select f.mois, sum(f.ecole)::integer, sum(f.eleve)::integer, coalesce(sum(f.montant), 0)
  from faits f
  group by f.mois
  order by f.mois;
end;
$$;

-- Une ligne : total encaissé, total restant dû, devise du dernier paiement.
create or replace function public.platform_payment_totals()
returns table (cashed_in numeric, outstanding numeric, currency text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme.' using errcode = '42501';
  end if;

  return query
  select coalesce(sum(p.amount) filter (where p.status::text in ('CONFIRMED', 'SETTLED', 'PAID')), 0),
         coalesce(sum(p.amount) filter (where p.status::text not in ('CONFIRMED', 'SETTLED', 'PAID', 'CANCELLED', 'REFUNDED')), 0),
         (select trim(d.currency)::text from public.payments d
           where d.currency is not null
           order by d.created_at desc limit 1)
  from public.payments p;
end;
$$;

revoke all on function public.platform_school_stats(timestamptz) from public, anon;
revoke all on function public.platform_monthly_stats(timestamptz) from public, anon;
revoke all on function public.platform_payment_totals() from public, anon;
grant execute on function public.platform_school_stats(timestamptz) to authenticated, service_role;
grant execute on function public.platform_monthly_stats(timestamptz) to authenticated, service_role;
grant execute on function public.platform_payment_totals() to authenticated, service_role;
