-- =============================================================================
-- 0140 — Le poste de pilotage du Super Admin (tableau de bord A « l'argent d'abord »)
-- =============================================================================
-- Décidé le 2026-10-25 (maquette docs/maquettes/super-admin-cockpit.html).
--
-- Une école paie UNE fois par an (début d'année, ou fin de son essai) : jamais
-- en plusieurs fois. Chaque école est dans une des 3 situations :
--   en essai · abonnée · abonnement expiré
-- (suspendue / résiliée à part). La situation est lue telle qu'elle est VRAIMENT
-- à cette date : un essai dont la date est passée, ou une année finie, compte
-- comme « expiré » même si personne n'a encore changé l'état à la main.
--
-- Une école est « à risque » après 2 jours de cours sans activité : ni appel,
-- ni note, ni action de son personnel, ni connexion. Un jour de cours est un jour
-- où l'emploi du temps publié a des cours (les congés n'en ont pas) ; sans
-- emploi du temps : du lundi au vendredi, hors congés du calendrier de l'école.
--
-- Une seule fonction, réservée à l'administration de la plateforme, qui rend
-- tout le tableau de bord en un appel.
-- =============================================================================

-- Les notes saisies récemment, école par école (sans lui : lecture de toutes
-- les notes de l'école, 542 000 sur l'école de démo).
create index if not exists grades_school_entered_idx on public.grades (school_id, entered_at desc);

create or replace function public.platform_cockpit(p_today date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_year_start date;
  v_month_start date := date_trunc('month', p_today)::date;
  v_grace int;
  v_money jsonb;
  v_months jsonb;
  v_modules jsonb;
  v_situations jsonb;
  v_people jsonb;
  v_health jsonb;
  v_sms jsonb;
  v_growth jsonb;
  v_currency text;
begin
  if not app.is_platform_admin() then
    raise exception 'Reserve a l''administration de la plateforme.' using errcode = '42501';
  end if;

  -- L'année scolaire commence le 1er septembre.
  v_year_start := make_date(extract(year from p_today)::int - case when extract(month from p_today) >= 9 then 0 else 1 end, 9, 1);
  v_grace := coalesce((select (ps.settings->>'graceDays')::int from platform_settings ps where ps.namespace = 'billing'), 15);
  v_currency := coalesce((select trim(p.currency) from payments p where p.currency is not null order by p.created_at desc limit 1), 'XOF');

  -- --- Argent reçu ------------------------------------------------------------
  select jsonb_build_object(
           'currency', v_currency,
           'yearStart', v_year_start,
           'receivedYear', coalesce(sum(p.amount) filter (where coalesce(p.paid_at, p.created_at)::date >= v_year_start), 0),
           'receivedMonth', coalesce(sum(p.amount) filter (where coalesce(p.paid_at, p.created_at)::date >= v_month_start), 0),
           'payingSchoolsYear', count(distinct p.school_id) filter (where coalesce(p.paid_at, p.created_at)::date >= v_year_start)
         )
  into v_money
  from payments p
  where p.status = 'PAID';

  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'amount', coalesce(x.amount, 0)) order by m), '[]'::jsonb)
  into v_months
  from generate_series(v_month_start - interval '11 months', v_month_start, interval '1 month') m
  left join (
    select date_trunc('month', coalesce(p.paid_at, p.created_at))::date as mois, sum(p.amount) as amount
    from payments p
    where p.status = 'PAID' and coalesce(p.paid_at, p.created_at)::date >= v_month_start - interval '11 months'
    group by 1
  ) x on x.mois = m::date;

  -- Par module : chaque paiement de l'année est réparti entre les modules de son
  -- abonnement, au prorata de leur prix.
  with paid as (
    select p.id, p.amount, p.subscription_id, coalesce(p.paid_at, p.created_at)::date as d
    from payments p
    where p.status = 'PAID' and coalesce(p.paid_at, p.created_at)::date >= v_year_start and p.subscription_id is not null
  ),
  parts as (
    select pd.id, md.name, coalesce(sm.price_paid, md.price_amount, 0) as w, pd.amount
    from paid pd
    join subscription_modules sm on sm.subscription_id = pd.subscription_id
      and sm.starts_on <= pd.d and (sm.ends_on is null or sm.ends_on >= pd.d)
    join modules md on md.id = sm.module_id
  ),
  shares as (
    select pr.name, pr.amount * pr.w / nullif(sum(pr.w) over (partition by pr.id), 0) as part
    from parts pr
  )
  select coalesce(jsonb_agg(jsonb_build_object('module', s.name, 'amount', round(s.total)) order by s.total desc), '[]'::jsonb)
  into v_modules
  from (select name, sum(part) as total from shares group by name) s;

  -- --- Situations des écoles ------------------------------------------------------
  with last_sub as (
    select distinct on (sb.school_id) sb.*
    from subscriptions sb
    order by sb.school_id, sb.created_at desc
  ),
  sit as (
    select s.id, s.name, s.slug, s.status::text as school_status,
           ls.status::text as sub_status, ls.trial_ends_at::date as trial_end, ls.current_period_end::date as period_end,
           case
             when s.status in ('SUSPENDED', 'ARCHIVED') then 'STOPPED'
             when ls.id is null then 'NONE'
             when ls.status in ('SUSPENDED', 'CANCELLED') then 'STOPPED'
             when ls.status = 'PAST_DUE' then 'EXPIRED'
             when ls.status = 'TRIALING' and ls.trial_ends_at is not null and ls.trial_ends_at::date < p_today then 'EXPIRED'
             when ls.status = 'ACTIVE' and ls.current_period_end is not null and ls.current_period_end::date < p_today then 'EXPIRED'
             when ls.status = 'TRIALING' then 'TRIAL'
             else 'PAID'
           end as situation,
           case
             when ls.status = 'TRIALING' then ls.trial_ends_at::date
             when ls.status in ('ACTIVE', 'PAST_DUE') then ls.current_period_end::date
           end as ends_on
    from schools s
    left join last_sub ls on ls.school_id = s.id
    where s.status <> 'PENDING'
  )
  select jsonb_build_object(
           'graceDays', v_grace,
           'counts', jsonb_build_object(
             'TRIAL', count(*) filter (where situation = 'TRIAL'),
             'PAID', count(*) filter (where situation = 'PAID'),
             'EXPIRED', count(*) filter (where situation = 'EXPIRED'),
             'STOPPED', count(*) filter (where situation = 'STOPPED'),
             'NONE', count(*) filter (where situation = 'NONE')),
           'trialsEndingSoon', count(*) filter (where situation = 'TRIAL' and ends_on <= p_today + 30),
           'expiredInGrace', count(*) filter (where situation = 'EXPIRED' and coalesce(ends_on, p_today) + v_grace >= p_today),
           'expiredCut', count(*) filter (where situation = 'EXPIRED' and ends_on is not null and ends_on + v_grace < p_today),
           'schools', coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'name', name, 'slug', slug, 'situation', situation, 'endsOn', ends_on,
             'graceEndsOn', case when situation = 'EXPIRED' and ends_on is not null then ends_on + v_grace end)
             order by case situation when 'EXPIRED' then 0 when 'TRIAL' then 1 when 'NONE' then 2 else 3 end, ends_on nulls last, name), '[]'::jsonb)
         )
  into v_situations
  from sit;

  -- --- Personnes ----------------------------------------------------------------
  select jsonb_build_object(
           'students', (select count(*) from students st where st.deleted_at is null),
           'studentsNewMonth', (select count(*) from students st where st.deleted_at is null and st.created_at::date >= v_month_start),
           'teachers', (select count(*) from teachers t where t.deleted_at is null and t.status = 'ACTIVE'),
           'guardians', (select count(*) from guardians g where g.status = 'ACTIVE'),
           'parentsConnected', (select count(*) from account_access a where a.subject_kind = 'GUARDIAN' and a.activation_status = 'ACTIVATED'),
           'schoolsNewMonth', (select count(*) from schools s where s.created_at::date >= v_month_start)
         )
  into v_people;

  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'schools', (
           select count(*) from schools s where s.created_at < (m + interval '1 month') and s.status <> 'PENDING'
         )) order by m), '[]'::jsonb)
  into v_growth
  from generate_series(v_month_start - interval '11 months', v_month_start, interval '1 month') m;

  -- --- Santé des écoles -----------------------------------------------------------
  with ecoles as (
    select s.id, s.name, s.slug from schools s where s.status = 'ACTIVE'
  ),
  -- Jours de cours des 30 derniers jours (avant aujourd'hui) : ceux de l'emploi du temps…
  jours_edt as (
    select o.school_id, o.occurs_on as d
    from session_occurrences o
    where o.occurs_on between p_today - 30 and p_today - 1 and o.status not in ('CANCELLED', 'MOVED')
    group by 1, 2
  ),
  -- … sinon lundi-vendredi, hors congés.
  jours_semaine as (
    select e.id as school_id, g::date as d
    from ecoles e
    cross join generate_series(p_today - 30, p_today - 1, interval '1 day') g
    where extract(isodow from g) <= 5
      and not exists (select 1 from jours_edt j where j.school_id = e.id)
      and not exists (
        select 1 from school_calendar_events ce
        where ce.school_id = e.id and ce.blocks_schedule and g::date between ce.starts_on and ce.ends_on)
  ),
  jours as (select * from jours_edt union all select * from jours_semaine),
  activite as (
    select e.id as school_id, greatest(
      (select max(r.taken_at)::date from attendance_registers r where r.school_id = e.id and r.taken_at >= p_today - 60),
      (select max(gr.entered_at)::date from grades gr where gr.school_id = e.id and gr.entered_at >= p_today - 60),
      (select max(a.created_at)::date from audit_logs a where a.school_id = e.id and a.created_at >= p_today - 60 and not a.actor_is_platform_admin),
      (select max(u.last_sign_in_at)::date from school_memberships m join auth.users u on u.id = m.user_id
        where m.school_id = e.id and m.status = 'ACTIVE')
    ) as derniere
    from ecoles e
  ),
  derniers5 as (
    select j.school_id, j.d, row_number() over (partition by j.school_id order by j.d desc) as rn from jours j
  ),
  semaine as (
    select e.id as school_id,
           (select count(*) from session_occurrences o
             where o.school_id = e.id and o.status not in ('CANCELLED', 'MOVED')
               and o.occurs_on in (select d from derniers5 x where x.school_id = e.id and x.rn <= 5)) as cours,
           (select count(*) from session_occurrences o join attendance_registers r on r.session_occurrence_id = o.id
             where o.school_id = e.id and r.status in ('SUBMITTED', 'VALIDATED')
               and o.occurs_on in (select d from derniers5 x where x.school_id = e.id and x.rn <= 5)) as appels,
           (select count(*) from grades gr where gr.school_id = e.id and gr.entered_at >= p_today - 7) as notes,
           (select count(*) > 0 from school_memberships m join auth.users u on u.id = m.user_id
             join membership_roles mr on mr.membership_id = m.id join roles ro on ro.id = mr.role_id
             where m.school_id = e.id and m.status = 'ACTIVE' and ro.code in ('FOUNDER', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'CENSOR')
               and u.last_sign_in_at >= p_today - 7) as direction
    from ecoles e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'name', e.name, 'slug', e.slug,
           'students', (select count(*) from students st where st.school_id = e.id and st.deleted_at is null),
           'lastActivity', a.derniere,
           'schoolDaysWithout', (select count(*) from jours j where j.school_id = e.id and j.d > coalesce(a.derniere, date '1900-01-01')),
           'sessions5d', w.cours, 'calls5d', w.appels, 'grades7d', w.notes, 'directionSeen7d', w.direction
         ) order by (select count(*) from jours j where j.school_id = e.id and j.d > coalesce(a.derniere, date '1900-01-01')) desc, e.name), '[]'::jsonb)
  into v_health
  from ecoles e
  join activite a on a.school_id = e.id
  join semaine w on w.school_id = e.id;

  -- --- SMS du mois ----------------------------------------------------------------
  select jsonb_build_object(
           'sent', count(*),
           'parts', coalesce(sum(m.parts), 0),
           'delivered', count(*) filter (where m.status = 'DELIVERED'),
           'failed', count(*) filter (where m.status = 'FAILED'),
           'failedYesterday', count(*) filter (where m.status = 'FAILED' and m.created_at::date = p_today - 1),
           'cost', coalesce(sum(m.cost), 0),
           'nearQuota', (
             select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'used', q.used, 'allowed', q.included + q.granted)), '[]'::jsonb)
             from schools s cross join lateral app.sms_quota(s.id) q
             where s.status = 'ACTIVE' and q.included + q.granted > 0 and q.used >= 0.8 * (q.included + q.granted))
         )
  into v_sms
  from sms_messages m
  where m.created_at >= v_month_start;

  return jsonb_build_object(
    'today', p_today,
    'money', v_money || jsonb_build_object('months', v_months, 'byModule', v_modules),
    'situations', v_situations,
    'people', v_people,
    'growth', v_growth,
    'health', v_health,
    'sms', v_sms
  );
end;
$$;

revoke all on function public.platform_cockpit(date) from public, anon;
grant execute on function public.platform_cockpit(date) to authenticated, service_role;
