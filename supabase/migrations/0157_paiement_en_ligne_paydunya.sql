-- =============================================================================
-- 0157 — Paiement en ligne des écoles (PayDunya)
-- =============================================================================
--
-- Décidé le 2026-10-28 (maquette docs/maquettes/paiement-en-ligne.html) :
-- l'école paie un module (ou tout son abonnement, depuis la page « Abonnement
-- expiré ») par Mobile Money ou carte, chez PayDunya. Les frais de PayDunya
-- sont payés EN PLUS par l'école (taux réglable par la plateforme).
--
-- Le 2026-10-28, il a précisé : TOUT ce qui se paie dans l'application passe par
-- PayDunya. D'où `purpose` : l'abonnement (modules) et les packs de SMS
-- aujourd'hui ; l'Espace Parent payé par les familles plus tard.
--
-- Un paiement en ligne est une ligne de `payments` comme les autres :
--   provider = 'paydunya', provider_reference = jeton de la facture PayDunya
--   (l'index unique (provider, provider_reference) de 0026 interdit de compter
--   deux fois le même paiement) ; PENDING tant que PayDunya n'a pas confirmé.
--
-- Il porte en plus : les modules qu'il paie, et les frais ajoutés. La
-- confirmation passe par UNE fonction (service_role seulement), appelée par le
-- serveur après avoir redemandé lui-même à PayDunya le statut et le montant :
-- le paiement devient PAID (le déclencheur de 0143 rend l'école abonnée jusqu'au
-- 31 août), chaque module payé est prolongé jusqu'à la même date, et le reçu
-- numéroté est émis — en une seule fois, sans possibilité de le rejouer.
-- =============================================================================

alter table payments
  add column if not exists purpose text not null default 'SUBSCRIPTION',
  add column if not exists sms_quantity integer,
  add column if not exists module_ids uuid[] not null default '{}',
  add column if not exists fee_amount numeric(12,2) not null default 0,
  add column if not exists checkout_url text,
  add column if not exists provider_status text,
  add column if not exists provider_details jsonb;

alter table payments drop constraint if exists payments_purpose_known;
alter table payments add constraint payments_purpose_known check (purpose in ('SUBSCRIPTION', 'SMS_PACK'));
alter table payments drop constraint if exists payments_sms_pack_quantity;
alter table payments add constraint payments_sms_pack_quantity check (purpose <> 'SMS_PACK' or (sms_quantity between 1 and 100000));
alter table payments drop constraint if exists payments_fee_positive;
alter table payments add constraint payments_fee_positive check (fee_amount >= 0);

comment on column payments.purpose is 'Ce que paie l''école : SUBSCRIPTION (modules), SMS_PACK (SMS en plus du quota).';
comment on column payments.sms_quantity is 'Pack de SMS : nombre de SMS ajoutés à la réserve de l''école à la confirmation.';
comment on column payments.module_ids is 'Modules payés (paiement en ligne) : prolongés jusqu''au 31 août à la confirmation.';
comment on column payments.fee_amount is 'Frais du paiement en ligne, payés en plus par l''école (le reçu porte le montant hors frais).';
comment on column payments.provider_status is 'Dernier statut lu chez l''opérateur (pending, completed, cancelled, failed).';

create index if not exists payments_online_pending_idx on payments (created_at) where provider = 'paydunya' and status = 'PENDING';

-- -----------------------------------------------------------------------------
-- Réserve de SMS achetés (décidé le 2026-10-28 : « ils restent valables jusqu'à
-- épuisement »). Un envoi prend d'abord dans le quota du mois (0094) ; une fois
-- celui-ci épuisé, dans la réserve. Elle ne baisse qu'à l'envoi réel.
-- -----------------------------------------------------------------------------
create table if not exists sms_credit_balances (
  school_id  uuid primary key references schools(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
comment on table sms_credit_balances is 'SMS achetés par l''école, valables jusqu''à épuisement. Écrit par les fonctions seulement.';

alter table sms_credit_balances enable row level security;
alter table sms_credit_balances force row level security;
create policy sms_credit_balances_select on sms_credit_balances for select to authenticated
  using (app.is_platform_admin() or app.is_member_of(school_id));

-- Prendre p_parts SMS dans la réserve, d'un seul coup (vrai) ou pas du tout (faux).
create or replace function public.sms_credit_consume(p_school uuid, p_parts integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.sms_credit_balances
     set balance = balance - p_parts, updated_at = now()
   where school_id = p_school and p_parts > 0 and balance >= p_parts;
  return found;
end;
$$;
revoke all on function public.sms_credit_consume(uuid, integer) from public, anon, authenticated;
grant execute on function public.sms_credit_consume(uuid, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Confirmer un paiement en ligne : payé, puis selon ce qu'il paie — modules
-- prolongés (abonnement) ou SMS ajoutés à la réserve (pack) — et reçu émis.
-- -----------------------------------------------------------------------------
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

  v_sub := coalesce(
    v_pay.subscription_id,
    (select sb.id from public.subscriptions sb where sb.school_id = v_pay.school_id order by sb.created_at desc limit 1)
  );
  if v_sub is not null then
    foreach v_module in array v_pay.module_ids loop
      select price_amount into v_price from public.modules where id = v_module;
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
  return app.issue_receipt(p_payment, coalesce('Abonnement — ' || v_label, 'Abonnement'));
end;
$$;
revoke all on function public.billing_settle_online(uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.billing_settle_online(uuid, numeric, jsonb) to service_role;

-- Annulé ou refusé chez PayDunya : le paiement en attente est clos, rien n'est prolongé.
create or replace function public.billing_cancel_online(p_payment uuid, p_status text, p_reason text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.payments
     set status = case when p_status = 'failed' then 'FAILED'::payment_status else 'CANCELLED'::payment_status end,
         provider_status = p_status,
         notes = left(coalesce(nullif(p_reason, ''), notes), 500)
   where id = p_payment and status = 'PENDING' and provider = 'paydunya';
$$;
revoke all on function public.billing_cancel_online(uuid, text, text) from public, anon, authenticated;
grant execute on function public.billing_cancel_online(uuid, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Seul un paiement d'ABONNEMENT rend l'école abonnée (0143) : acheter un pack de
-- SMS ne doit pas rouvrir un abonnement expiré. Même fonction, une condition de plus.
-- -----------------------------------------------------------------------------
create or replace function app.payments_activate_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paid date := coalesce(new.paid_at, now())::date;
  v_start date := make_date(extract(year from v_paid)::int - case when extract(month from v_paid) >= 8 then 0 else 1 end, 9, 1);
  v_end date := make_date(extract(year from v_paid)::int - case when extract(month from v_paid) >= 8 then 0 else 1 end + 1, 8, 31);
  v_sub uuid;
begin
  if new.status <> 'PAID' or (tg_op = 'UPDATE' and old.status = 'PAID') or new.purpose <> 'SUBSCRIPTION' then
    return new;
  end if;
  v_sub := coalesce(
    new.subscription_id,
    (select sb.id from subscriptions sb where sb.school_id = new.school_id order by sb.created_at desc limit 1)
  );
  if v_sub is null then
    return new;
  end if;
  update subscriptions
     set status = 'ACTIVE',
         current_period_start = v_start,
         current_period_end = v_end
   where id = v_sub
     and (status <> 'ACTIVE' or current_period_end is null or current_period_end::date < v_end);
  return new;
end;
$$;
