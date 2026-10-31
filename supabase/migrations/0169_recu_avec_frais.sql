-- =============================================================================
-- 0169 — Le reçu porte le montant réellement payé, frais compris
-- =============================================================================
-- Décidé le 2026-10-31 après le premier paiement en ligne (Cocotiers) : l'école
-- a payé 103 000 F (100 000 F d'abonnement + 3 000 F de frais PayDunya) et son
-- reçu disait 100 000 F. Le reçu doit dire ce qui a été payé : 103 000 F, avec
-- le détail des frais dans son objet.
--
-- Le seul reçu déjà émis avec des frais est celui de ce paiement de test
-- (RECU-2026-0001) : il est remis au bon montant ici, une fois. Pour tous les
-- autres, un reçu ne change plus.
-- =============================================================================

create or replace function app.issue_receipt(p_payment uuid, p_label text)
returns text
language plpgsql
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
declare
  v_payment  public.payments%rowtype;
  v_year     integer := extract(year from now())::integer;
  v_seq      integer;
  v_number   text;
  v_existing text;
  v_label    text;
begin
  select * into v_payment from public.payments where id = p_payment;
  if not found then
    raise exception 'Paiement introuvable.' using errcode = 'P0002';
  end if;
  if v_payment.status <> 'PAID' then
    raise exception 'Un recu ne s''emet que pour un paiement confirme.' using errcode = 'P0001';
  end if;

  -- Deja emis : on rend le meme numero plutot que d'en creer un second.
  select number into v_existing from public.payment_receipts where payment_id = p_payment;
  if v_existing is not null then
    return v_existing;
  end if;

  v_label := coalesce(nullif(btrim(p_label), ''), 'Abonnement');
  if coalesce(v_payment.fee_amount, 0) > 0 then
    v_label := v_label || ' (dont ' || replace(to_char(v_payment.fee_amount, 'FM999,999,999'), ',', ' ')
               || ' F de frais de paiement en ligne)';
  end if;

  perform pg_advisory_xact_lock(hashtext('geschool.receipts'), v_year);
  select coalesce(max(sequence), 0) + 1 into v_seq from public.payment_receipts where year = v_year;
  v_number := 'RECU-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into public.payment_receipts (school_id, payment_id, number, year, sequence, amount, currency, label)
  values (v_payment.school_id, p_payment, v_number, v_year, v_seq,
          v_payment.amount + coalesce(v_payment.fee_amount, 0), v_payment.currency, v_label);

  return v_number;
end;
$$;
revoke execute on function app.issue_receipt(uuid, text) from public;

comment on column public.payments.fee_amount is
  'Frais du paiement en ligne, payés en plus par l''école ; le reçu porte le total frais compris (0169).';

-- Le reçu du paiement de test du 2026-10-31, émis avant cette règle.
update public.payment_receipts r
set amount = p.amount + p.fee_amount,
    label = 'Abonnement — Appel numérique (dont '
            || replace(to_char(p.fee_amount, 'FM999,999,999'), ',', ' ') || ' F de frais de paiement en ligne)'
from public.payments p
where p.id = r.payment_id
  and r.number = 'RECU-2026-0001'
  and p.fee_amount > 0
  and r.amount = p.amount;
