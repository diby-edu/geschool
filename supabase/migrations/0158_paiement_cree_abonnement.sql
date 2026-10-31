-- =============================================================================
-- 0158 — Paiement en ligne : une école sans abonnement en obtient un
-- =============================================================================
--
-- Constaté le 2026-10-28 : Groupe Scolaire Les Cocotiers (et d'autres écoles
-- créées avant la facturation) n'ont AUCUNE ligne dans `subscriptions`. Un
-- paiement en ligne confirmé n'avait alors rien à prolonger. La confirmation
-- crée désormais l'abonnement s'il manque (plan facultatif depuis 0042), avant
-- de passer le paiement à PAID. Le reste de la fonction de 0157 est inchangé.
-- =============================================================================

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

  -- Une école sans abonnement (jamais souscrite, ou créée avant la facturation) :
  -- on le crée AVANT de passer le paiement à PAID, pour que le déclencheur de
  -- 0143 le trouve et la rende abonnée jusqu'au 31 août.
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
