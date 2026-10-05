-- =============================================================================
-- 0102 — Un abonnement par MODULE, avec son echeance et son recu
--
-- Aujourd'hui, `subscription_modules` ne retient que « cette ecole a ce
-- module ». L'ecran ne peut donc pas repondre aux questions que se pose un
-- directeur devant sa facture :
--
--   depuis quand ?   jusqu'a quand ?   combien de jours restants ?
--   est-ce la version complete ou une demonstration ?
--
-- Chaque module se souscrit, s'echoit et se renouvelle SEPAREMENT : une ecole
-- peut garder l'appel numerique et laisser expirer les bulletins.
--
-- Et un paiement laisse un RECU. Pas un ecran qui dit « paiement enregistre »
-- et qu'on ne retrouve plus : une piece numerotee, qu'on telecharge et qu'on
-- classe.
-- =============================================================================

create type module_access_mode as enum ('FULL', 'DEMO');

alter table subscription_modules
  add column if not exists starts_on date not null default current_date,
  add column if not exists ends_on   date,
  add column if not exists mode      module_access_mode not null default 'FULL',
  add column if not exists price_paid numeric(12,2),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Une echeance posterieure au debut, ou pas d'echeance du tout (module offert).
alter table subscription_modules drop constraint if exists subscription_modules_dates;
alter table subscription_modules
  add constraint subscription_modules_dates check (ends_on is null or ends_on > starts_on);

comment on column subscription_modules.ends_on is
  'Echeance propre a CE module. Nulle = sans limite (module offert ou inclus a vie).';
comment on column subscription_modules.mode is
  'FULL : la version complete. DEMO : acces d''essai, a convertir avant l''echeance.';
comment on column subscription_modules.price_paid is
  'Ce que l''ecole a effectivement paye, qui peut differer du prix catalogue (remise, promotion).';

create trigger subscription_modules_touch before update on subscription_modules
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Les recus
--
-- Numerotes par annee, en continu : RECU-2026-0001. Le numero se calcule en
-- base, sous verrou, pour que deux paiements simultanes n'en obtiennent pas
-- deux fois le meme.
-- -----------------------------------------------------------------------------

create table payment_receipts (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  payment_id  uuid not null references payments(id) on delete cascade,

  number      text not null unique,
  year        integer not null,
  sequence    integer not null,

  amount      numeric(12,2) not null,
  currency    char(3) not null default 'XOF',
  /** Ce que le recu paie, en clair : « Appel numerique — 1 an ». */
  label       text not null,
  issued_at   timestamptz not null default now(),

  unique (school_id, payment_id),
  unique (year, sequence),
  constraint payment_receipts_amount check (amount >= 0)
);

create index payment_receipts_school_idx on payment_receipts (school_id, issued_at desc);

alter table payment_receipts enable row level security;
alter table payment_receipts force  row level security;

-- L'ecole lit SES recus ; la plateforme les voit tous. Personne ne les ecrit
-- a la main : ils naissent avec le paiement (fonction ci-dessous).
create policy payment_receipts_select on payment_receipts for select to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_schools_with('billing.view'))
);

-- -----------------------------------------------------------------------------
-- Emettre un recu
--
-- SECURITY DEFINER : la table n'a aucune policy d'ecriture, personne ne peut
-- donc fabriquer un recu a la main. Le numero est pris sous verrou consultatif
-- pour que deux paiements du meme instant n'obtiennent pas le meme.
-- -----------------------------------------------------------------------------

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

  perform pg_advisory_xact_lock(hashtext('geschool.receipts'), v_year);
  select coalesce(max(sequence), 0) + 1 into v_seq from public.payment_receipts where year = v_year;
  v_number := 'RECU-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into public.payment_receipts (school_id, payment_id, number, year, sequence, amount, currency, label)
  values (v_payment.school_id, p_payment, v_number, v_year, v_seq, v_payment.amount, v_payment.currency,
          coalesce(nullif(btrim(p_label), ''), 'Abonnement'));

  return v_number;
end;
$$;

revoke execute on function app.issue_receipt(uuid, text) from public;

comment on table payment_receipts is
  'Recus numerotes des paiements confirmes. Ecrits par app.issue_receipt seule : aucune policy d''ecriture.';
