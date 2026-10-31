-- =============================================================================
-- 0172 — Espace Parent payé par les parents, par enfant
-- =============================================================================
-- Décidé le 2026-10-31 (maquette docs/maquettes/espace-parent.html) :
--   * RIEN n'est gratuit : un enfant non payé ne montre aucune information
--     (notes, absences, bulletins, documents…) — seulement son nom et sa classe,
--     pour que le parent sache quoi payer ;
--   * on paie PAR ENFANT, pour l'année scolaire (jusqu'au 31 août) ; le prix ne
--     dépend que du nombre d'enfants, jamais du nombre de tuteurs ;
--   * tous les tuteurs de l'enfant y accèdent, n'importe lequel peut payer ;
--   * le tarif se règle dans le tableau de bord Super Admin, un prix pour toutes
--     les écoles et un prix différent possible par école (0 = offert) ;
--   * l'école ne reçoit pas d'argent mais une RÉDUCTION en % sur son prochain
--     abonnement, par paliers d'élèves activés (ex. 30 % → 10 %, 60 % → 20 %),
--     calculée le jour où elle paie.
--
-- Le verrou est dans la base : tout ce qu'un parent lit d'un enfant passe par
-- app.my_linked_students() (notes, présences, bulletins, documents,
-- justificatifs, conseil…). Sa branche « parent » ne garde plus que les enfants
-- débloqués ; le nom et la classe restent lisibles par app.my_children_all().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Réglages : prix et paliers (plateforme), et l'exception par école
-- -----------------------------------------------------------------------------
insert into platform_settings (namespace, settings)
values ('parent_portal', '{"pricePerChild": 2000, "tiers": [{"minPct": 30, "discountPct": 10}, {"minPct": 60, "discountPct": 20}]}'::jsonb)
on conflict (namespace) do nothing;

create table if not exists parent_portal_rules (
  school_id       uuid primary key references schools(id) on delete cascade,
  price_per_child numeric(12,2) check (price_per_child is null or price_per_child >= 0),
  tiers           jsonb check (tiers is null or jsonb_typeof(tiers) = 'array'),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references users(id) on delete set null
);
alter table parent_portal_rules enable row level security;
drop policy if exists parent_portal_rules_select on parent_portal_rules;
create policy parent_portal_rules_select on parent_portal_rules for select to authenticated
using (app.is_platform_admin() or app.is_member_of(school_id));
drop policy if exists parent_portal_rules_write on parent_portal_rules;
create policy parent_portal_rules_write on parent_portal_rules for all to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());
grant select, insert, update, delete on parent_portal_rules to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Les enfants débloqués
-- -----------------------------------------------------------------------------
create table if not exists student_parent_access (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  valid_until date not null,
  payment_id  uuid references payments(id) on delete set null,
  paid_by     uuid references users(id) on delete set null,
  amount      numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (student_id, valid_until)
);
create index if not exists student_parent_access_school_idx on student_parent_access (school_id, valid_until);
alter table student_parent_access enable row level security;
grant select on student_parent_access to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Fonctions
-- -----------------------------------------------------------------------------

/** Prix d'un enfant pour une école : sa règle, sinon celui de la plateforme. */
create or replace function app.parent_price(p_school uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select r.price_per_child from parent_portal_rules r where r.school_id = p_school),
    (select (s.settings ->> 'pricePerChild')::numeric from platform_settings s where s.namespace = 'parent_portal'),
    2000
  )
$$;

/** Paliers de réduction d'une école : les siens, sinon ceux de la plateforme. */
create or replace function app.parent_tiers(p_school uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select r.tiers from parent_portal_rules r where r.school_id = p_school),
    (select s.settings -> 'tiers' from platform_settings s where s.namespace = 'parent_portal'),
    '[]'::jsonb
  )
$$;

/** Un enfant est débloqué : payé pour l'année en cours, ou école offerte (prix 0). */
create or replace function app.child_unlocked(p_school uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.parent_price(p_school) = 0
      or exists (
        select 1 from student_parent_access a
        where a.student_id = p_student
          and a.valid_until >= (now() at time zone 'Africa/Abidjan')::date
      )
$$;

/** Tous les enfants du parent connecté, payés ou non (nom et classe seulement). */
create or replace function app.my_children_all()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select sg.student_id
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id
  where g.user_id = auth.uid() and g.status = 'ACTIVE'
    and sg.school_id in (
      select m.school_id from public.school_memberships m where m.user_id = auth.uid() and m.status = 'ACTIVE'
    )
$$;

-- Les élèves qu'on peut suivre : la branche « parent » ne garde que les enfants
-- débloqués. Le reste est inchangé (élève lui-même, enseignants, prof principal).
create or replace function app.my_linked_students()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  with ms as (
    select m.school_id from public.school_memberships m
    where m.user_id = auth.uid() and m.status = 'ACTIVE'
  ),
  me as (
    select t.id, t.school_id from public.teachers t
    where t.user_id = auth.uid() and t.deleted_at is null
      and t.school_id in (select school_id from ms)
  )
  -- Ses enfants (parent ou tuteur actif), s'ils sont débloqués (0172)
  select sg.student_id
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id
  where g.user_id = auth.uid() and g.status = 'ACTIVE'
    and sg.school_id in (select school_id from ms)
    and app.child_unlocked(sg.school_id, sg.student_id)
  union
  -- Lui-même (élève avec un compte)
  select s.id from public.students s
  where s.user_id = auth.uid() and s.deleted_at is null
    and s.school_id in (select school_id from ms)
  union
  -- Les élèves de ses classes
  select se.student_id
  from public.teaching_assignments ta
  join me on me.id = ta.teacher_id
  join public.student_enrollments se
    on se.class_id = ta.class_id and se.academic_year_id = ta.academic_year_id
  where ta.status = 'ACTIVE' and se.status = 'ENROLLED'
  union
  -- Les élèves de ses groupes (LV2, options)
  select sgr.student_id
  from public.teaching_assignments ta
  join me on me.id = ta.teacher_id
  join public.student_groups sgr
    on sgr.group_id = ta.group_id and sgr.academic_year_id = ta.academic_year_id
  where ta.status = 'ACTIVE' and sgr.left_at is null
  union
  -- Les élèves de sa classe de professeur principal
  select se.student_id
  from public.classes c
  join me on me.id = c.head_teacher_id
  join public.student_enrollments se on se.class_id = c.id
  where se.status = 'ENROLLED';
$$;

-- Le nom et la classe d'un enfant restent lisibles, payé ou non.
drop policy if exists students_select on students;
create policy students_select on students for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('students.view'))
  or id in (select app.my_linked_students())
  or id in (select app.my_children_all())
);
drop policy if exists enrollments_select on student_enrollments;
create policy enrollments_select on student_enrollments for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('students.view'))
  or student_id in (select app.my_linked_students())
  or student_id in (select app.my_children_all())
);

drop policy if exists student_parent_access_select on student_parent_access;
create policy student_parent_access_select on student_parent_access for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('students.view'))
  or student_id in (select app.my_children_all())
);

/**
 * L'écran du parent : le prix, et pour chacun de ses enfants dans l'école son
 * nom, sa classe, s'il est débloqué, jusqu'à quand et par qui.
 */
create or replace function public.parent_portal_children(p_school uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with kids as (
    select distinct s.id, s.first_name, s.last_name
    from app.my_children_all() c(id)
    join students s on s.id = c.id and s.school_id = p_school and s.deleted_at is null
  ),
  today as (select (now() at time zone 'Africa/Abidjan')::date as d)
  select jsonb_build_object(
    'price', app.parent_price(p_school),
    'children', coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id,
      'name', upper(k.last_name) || ' ' || k.first_name,
      'className', (select c.name from student_enrollments e join classes c on c.id = e.class_id
                     where e.student_id = k.id and e.status = 'ENROLLED' order by e.created_at desc limit 1),
      'unlocked', app.child_unlocked(p_school, k.id),
      'validUntil', a.valid_until,
      'paidBy', (select coalesce(nullif(btrim(coalesce(u.first_name, '') || ' ' || upper(coalesce(u.last_name, ''))), ''), u.display_name)
                   from users u where u.id = a.paid_by),
      'paidAt', a.created_at
    ) order by k.last_name, k.first_name), '[]'::jsonb)
  )
  from kids k
  left join lateral (
    select x.valid_until, x.paid_by, x.created_at from student_parent_access x, today
    where x.student_id = k.id and x.valid_until >= today.d
    order by x.valid_until desc limit 1
  ) a on true
$$;
revoke all on function public.parent_portal_children(uuid) from public, anon;
grant execute on function public.parent_portal_children(uuid) to authenticated;

/** Réduction d'une école aujourd'hui : le palier atteint par sa part d'élèves activés. */
create or replace function app.school_parent_discount(p_school uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with n as (
    select
      (select count(distinct e.student_id) from student_enrollments e where e.school_id = p_school and e.status = 'ENROLLED') as total,
      (select count(distinct a.student_id) from student_parent_access a
        join student_enrollments e on e.student_id = a.student_id and e.status = 'ENROLLED'
        where a.school_id = p_school and a.valid_until >= (now() at time zone 'Africa/Abidjan')::date) as paid
  )
  select coalesce(max((t ->> 'discountPct')::numeric) filter (
           where n.total > 0 and n.paid * 100.0 / n.total >= (t ->> 'minPct')::numeric), 0)
  from n, jsonb_array_elements(app.parent_tiers(p_school)) t
$$;

/** Ce que voit l'école (abonnement) : élèves, activés, cette semaine, paliers, réduction atteinte. */
create or replace function public.school_parent_overview(p_school uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Africa/Abidjan')::date;
begin
  if not (app.is_platform_admin() or app.can_read(p_school, 'billing.view') or app.can_read(p_school, 'students.view')) then
    raise exception 'Droit requis : abonnement ou élèves.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'price', app.parent_price(p_school),
    'tiers', app.parent_tiers(p_school),
    'discountPct', app.school_parent_discount(p_school),
    'students', (select count(distinct e.student_id) from student_enrollments e where e.school_id = p_school and e.status = 'ENROLLED'),
    'activated', (select count(distinct a.student_id) from student_parent_access a
                   join student_enrollments e on e.student_id = a.student_id and e.status = 'ENROLLED'
                   where a.school_id = p_school and a.valid_until >= v_today),
    'thisWeek', (select count(distinct a.student_id) from student_parent_access a
                  where a.school_id = p_school and a.valid_until >= v_today and a.created_at >= now() - interval '7 days'),
    'collected', (select coalesce(sum(a.amount), 0) from student_parent_access a where a.school_id = p_school and a.valid_until >= v_today)
  );
end;
$$;
revoke all on function public.school_parent_overview(uuid) from public, anon;
grant execute on function public.school_parent_overview(uuid) to authenticated;

/** Pour les envois (service) : parmi ces élèves, ceux qui sont débloqués. */
create or replace function public.students_unlocked(p_school uuid, p_students uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s from unnest(p_students) s where app.child_unlocked(p_school, s)
$$;
revoke all on function public.students_unlocked(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.students_unlocked(uuid, uuid[]) to service_role;

grant execute on function app.parent_price(uuid) to authenticated, service_role;
grant execute on function app.parent_tiers(uuid) to authenticated, service_role;
grant execute on function app.child_unlocked(uuid, uuid) to authenticated, service_role;
grant execute on function app.my_children_all() to authenticated;
grant execute on function app.school_parent_discount(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Paiements : l'Espace Parent, et la réduction d'abonnement
-- -----------------------------------------------------------------------------
alter table payments add column if not exists student_ids uuid[] not null default '{}';
alter table payments add column if not exists discount_pct numeric(5,2) not null default 0;
alter table payments drop constraint if exists payments_purpose_known;
alter table payments add constraint payments_purpose_known check (purpose in ('SUBSCRIPTION', 'SMS_PACK', 'PARENT_ACCESS'));
comment on column payments.student_ids is 'Espace Parent (0172) : enfants débloqués à la confirmation, jusqu''au 31 août.';
comment on column payments.discount_pct is 'Abonnement (0172) : réduction appliquée au montant, gagnée par les élèves activés.';

create or replace function public.billing_settle_online(p_payment uuid, p_paid_total numeric, p_details jsonb)
returns text
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_pay public.payments%rowtype;
  v_today date := (now() at time zone 'Africa/Abidjan')::date;
  -- Même règle que 0143 : de septembre à août ; un paiement d'août vaut pour l'année qui commence.
  v_end date := make_date(extract(year from v_today)::int - case when extract(month from v_today) >= 8 then 0 else 1 end + 1, 8, 31);
  v_sub uuid;
  v_module uuid;
  v_price numeric;
  v_label text;
  v_n integer;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if not found then
    raise exception 'Paiement introuvable.' using errcode = 'P0002';
  end if;
  -- Déjà confirmé (IPN et retour arrivés ensemble) : on rend le même reçu.
  if v_pay.status = 'PAID' then
    return app.issue_receipt(p_payment, 'Abonnement');
  end if;
  if v_pay.status <> 'PENDING' or coalesce(v_pay.provider, '') <> 'paydunya' then
    raise exception 'Ce paiement ne peut plus être confirmé.' using errcode = 'P0001';
  end if;
  if round(p_paid_total, 2) <> round(v_pay.amount + v_pay.fee_amount, 2) then
    raise exception 'Montant payé (%) différent du montant attendu (%).', p_paid_total, v_pay.amount + v_pay.fee_amount using errcode = 'P0001';
  end if;

  if v_pay.purpose = 'SUBSCRIPTION' then
    v_sub := coalesce(
      v_pay.subscription_id,
      (select sb.id from public.subscriptions sb where sb.school_id = v_pay.school_id order by sb.created_at desc limit 1)
    );
    if v_sub is null then
      insert into public.subscriptions (school_id, status) values (v_pay.school_id, 'TRIALING') returning id into v_sub;
    end if;
    update public.payments set subscription_id = v_sub where id = p_payment;
  end if;

  update public.payments
     set status = 'PAID', paid_at = now(), provider_status = 'completed', provider_details = p_details
   where id = p_payment;

  -- Pack de SMS : ajouté à la réserve de l'école, valable jusqu'à épuisement.
  if v_pay.purpose = 'SMS_PACK' then
    insert into public.sms_credit_balances (school_id, balance)
    values (v_pay.school_id, v_pay.sms_quantity)
    on conflict (school_id) do update set balance = public.sms_credit_balances.balance + excluded.balance, updated_at = now();
    return app.issue_receipt(p_payment, 'Pack de ' || v_pay.sms_quantity || ' SMS');
  end if;

  -- Espace Parent (0172) : chaque enfant payé est débloqué jusqu'au 31 août,
  -- pour tous ses tuteurs.
  if v_pay.purpose = 'PARENT_ACCESS' then
    v_n := coalesce(cardinality(v_pay.student_ids), 0);
    insert into public.student_parent_access (school_id, student_id, valid_until, payment_id, paid_by, amount)
    select v_pay.school_id, s, v_end, p_payment, v_pay.recorded_by, round(v_pay.amount / greatest(v_n, 1), 2)
    from unnest(v_pay.student_ids) s
    on conflict (student_id, valid_until) do nothing;
    return app.issue_receipt(p_payment, 'Espace Parent — ' || v_n || ' enfant' || case when v_n > 1 then 's' else '' end || ' (jusqu''au ' || to_char(v_end, 'DD/MM/YYYY') || ')');
  end if;

  v_sub := coalesce(
    v_pay.subscription_id,
    (select sb.id from public.subscriptions sb where sb.school_id = v_pay.school_id order by sb.created_at desc limit 1)
  );
  if v_sub is not null then
    foreach v_module in array v_pay.module_ids loop
      select price_amount into v_price from public.modules where id = v_module;
      v_price := round(v_price * (100 - v_pay.discount_pct) / 100, 2);
      update public.subscription_modules
         set ends_on = greatest(coalesce(ends_on, v_end), v_end), mode = 'FULL', price_paid = coalesce(price_paid, v_price)
       where subscription_id = v_sub and module_id = v_module;
      if not found then
        insert into public.subscription_modules (school_id, subscription_id, module_id, starts_on, ends_on, mode, price_paid)
        values (v_pay.school_id, v_sub, v_module, v_today, v_end, 'FULL', v_price);
      end if;
    end loop;
  end if;

  select string_agg(m.name, ', ' order by m.name) into v_label from public.modules m where m.id = any (v_pay.module_ids);
  return app.issue_receipt(
    p_payment,
    coalesce('Abonnement — ' || v_label, 'Abonnement')
      || case when v_pay.discount_pct > 0 then ' — réduction Espace Parent ' || trim(to_char(v_pay.discount_pct, 'FM990.##')) || ' %' else '' end
  );
end;
$$;
revoke all on function public.billing_settle_online(uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.billing_settle_online(uuid, numeric, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 5. L'emploi du temps d'un enfant : lui aussi seulement s'il est débloqué
-- -----------------------------------------------------------------------------
create or replace function app.my_visible_sessions()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  with mine as (
    -- = my_student_ids(école), pour toutes les écoles à la fois ; un enfant
    -- seulement s'il est débloqué (0172)
    select sg.student_id, sg.school_id
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where g.user_id = auth.uid() and g.status = 'ACTIVE'
      and app.child_unlocked(sg.school_id, sg.student_id)
    union
    select s.id, s.school_id
    from public.students s
    where s.user_id = auth.uid() and s.deleted_at is null
  )
  -- Les cours dont je suis l'un des enseignants
  select st.session_id
  from public.schedule_session_teachers st
  join public.teachers t on t.id = st.teacher_id
  where t.user_id = auth.uid() and t.deleted_at is null
  union
  -- Les cours publiés de la classe ou du groupe d'un de mes enfants
  select s.id
  from public.schedule_sessions s
  join public.schedule_versions v on v.id = s.schedule_version_id
  join public.schedule_session_targets tg on tg.session_id = s.id
  left join public.student_enrollments se
    on se.class_id = tg.class_id
   and se.academic_year_id = s.academic_year_id
   and se.status = 'ENROLLED'
  left join public.student_groups sgr
    on sgr.group_id = tg.group_id
   and sgr.academic_year_id = s.academic_year_id
   and sgr.left_at is null
  where v.status = 'PUBLISHED'
    and s.school_id in (select school_id from mine)
    and exists (
      select 1 from mine
      where mine.school_id = s.school_id
        and mine.student_id = coalesce(se.student_id, sgr.student_id)
    );
$$;

-- -----------------------------------------------------------------------------
-- 6. L'école : quels élèves sont activés (page Abonnement → Espace Parent)
-- -----------------------------------------------------------------------------
-- Filtres : classe, état (activés / non activés), recherche ; 50 par page.
create or replace function public.school_parent_students(
  p_school uuid, p_class uuid default null, p_state text default null, p_q text default null,
  p_limit integer default 50, p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Africa/Abidjan')::date;
  v jsonb;
begin
  if not (app.is_platform_admin() or app.can_read(p_school, 'billing.view') or app.can_read(p_school, 'students.view')) then
    raise exception 'Droit requis : abonnement ou élèves.' using errcode = '42501';
  end if;
  with base as (
    select distinct on (s.id) s.id, s.matricule, upper(s.last_name) || ' ' || s.first_name as name,
           c.name as class_name, l.sequence as level_seq,
           a.created_at as paid_at,
           (select coalesce(nullif(btrim(coalesce(u.first_name, '') || ' ' || upper(coalesce(u.last_name, ''))), ''), u.display_name)
              from users u where u.id = a.paid_by) as paid_by
    from student_enrollments e
    join students s on s.id = e.student_id and s.deleted_at is null
    join classes c on c.id = e.class_id
    left join levels l on l.id = c.level_id
    left join lateral (
      select x.created_at, x.paid_by from student_parent_access x
      where x.student_id = s.id and x.valid_until >= v_today
      order by x.created_at desc limit 1
    ) a on true
    where e.school_id = p_school and e.status = 'ENROLLED'
      and (p_class is null or e.class_id = p_class)
      and (p_q is null or p_q = '' or (s.last_name || ' ' || s.first_name || ' ' || s.matricule) ilike '%' || p_q || '%')
    order by s.id
  ),
  kept as (
    select * from base
    where p_state is null or p_state = ''
       or (p_state = 'actives' and paid_at is not null)
       or (p_state = 'non' and paid_at is null)
  )
  select jsonb_build_object(
    'total', (select count(*) from kept),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
              'id', k.id, 'name', k.name, 'matricule', k.matricule, 'className', k.class_name,
              'paidAt', k.paid_at, 'paidBy', k.paid_by) order by k.rn)
            from (select kept.*, row_number() over (order by level_seq, class_name collate public.naturel, name) rn from kept
                  order by level_seq, class_name collate public.naturel, name
                  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)) k), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function public.school_parent_students(uuid, uuid, text, text, integer, integer) from public, anon;
grant execute on function public.school_parent_students(uuid, uuid, text, text, integer, integer) to authenticated;
