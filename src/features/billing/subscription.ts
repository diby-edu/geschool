import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

/**
 * L'abonnement, module par module.
 *
 * Un directeur ne se demande pas « quel est mon plan ? » — il se demande
 * « jusqu'a quand ai-je l'appel numerique, et combien me reste-t-il de
 * jours ? ». Chaque module se souscrit, s'echoit et se renouvelle separement.
 */

export type SubscribedModule = {
  id: string;
  code: string;
  name: string;
  description: string;
  /** Prix catalogue, par periode. */
  price: number;
  currency: string;
  /** Ce qui a reellement ete paye, s'il differe du catalogue. */
  pricePaid: number | null;
  startsOn: string;
  endsOn: string | null;
  mode: 'FULL' | 'DEMO';
  /** Negatif = depasse ; null = sans echeance. */
  daysLeft: number | null;
  expired: boolean;
};

export type ModuleOffer = {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  currency: string;
};

export type Receipt = {
  id: string;
  number: string;
  label: string;
  amount: number;
  currency: string;
  issuedAt: string;
};

export type BillingOverview = {
  modules: SubscribedModule[];
  available: ModuleOffer[];
  receipts: Receipt[];
  counts: { total: number; full: number; demo: number; expired: number };
};

/** Jours entre aujourd'hui et une echeance, en jours pleins. */
export function daysUntil(endsOn: string | null, today = new Date()): number | null {
  if (!endsOn) return null;
  const fin = Date.parse(`${endsOn}T00:00:00`);
  const jour = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00`);
  if (!Number.isFinite(fin) || !Number.isFinite(jour)) return null;
  return Math.round((fin - jour) / 86_400_000);
}

export async function readBilling(ctx: TenantContext, receiptLimit = 5): Promise<BillingOverview> {
  const supabase = await createClient();

  const [{ data: souscrits }, { data: catalogue }, { data: recus }] = await Promise.all([
    supabase
      .from('subscription_modules')
      .select('id, starts_on, ends_on, mode, price_paid, modules(id, code, name, description, price_amount, currency)')
      .eq('school_id', ctx.school.id),
    supabase
      .from('modules')
      .select('id, code, name, description, price_amount, currency')
      .eq('is_active', true)
      .order('price_amount'),
    supabase
      .from('payment_receipts')
      .select('id, number, label, amount, currency, issued_at')
      .eq('school_id', ctx.school.id)
      .order('issued_at', { ascending: false })
      .limit(receiptLimit),
  ]);

  type Ligne = {
    id: string;
    starts_on: string;
    ends_on: string | null;
    mode: 'FULL' | 'DEMO';
    price_paid: number | null;
    modules: { id: string; code: string; name: string; description: string; price_amount: number; currency: string } | null;
  };

  const modules: SubscribedModule[] = ((souscrits ?? []) as unknown as Ligne[])
    .filter((l) => l.modules)
    .map((l) => {
      const jours = daysUntil(l.ends_on);
      return {
        id: l.id,
        code: l.modules!.code,
        name: l.modules!.name,
        description: l.modules!.description,
        price: Number(l.modules!.price_amount),
        currency: l.modules!.currency,
        pricePaid: l.price_paid === null ? null : Number(l.price_paid),
        startsOn: l.starts_on,
        endsOn: l.ends_on,
        mode: l.mode,
        daysLeft: jours,
        expired: jours !== null && jours < 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const pris = new Set(modules.map((m) => m.code));
  const available: ModuleOffer[] = ((catalogue ?? []) as {
    id: string;
    code: string;
    name: string;
    description: string;
    price_amount: number;
    currency: string;
  }[])
    .filter((m) => !pris.has(m.code))
    .map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      description: m.description,
      price: Number(m.price_amount),
      currency: m.currency,
    }));

  const receipts: Receipt[] = ((recus ?? []) as {
    id: string;
    number: string;
    label: string;
    amount: number;
    currency: string;
    issued_at: string;
  }[]).map((r) => ({
    id: r.id,
    number: r.number,
    label: r.label,
    amount: Number(r.amount),
    currency: r.currency,
    issuedAt: r.issued_at,
  }));

  return {
    modules,
    available,
    receipts,
    counts: {
      total: modules.length,
      full: modules.filter((m) => m.mode === 'FULL' && !m.expired).length,
      demo: modules.filter((m) => m.mode === 'DEMO' && !m.expired).length,
      expired: modules.filter((m) => m.expired).length,
    },
  };
}
