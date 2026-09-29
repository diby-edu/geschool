import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { assertPlatformAdmin } from './platform';

/**
 * Catalogue des modules vendables.
 *
 * Un module du catalogue porte un PRIX ; le même code décide aussi de ce que
 * l'école voit (`school_features`, migration 0070). Les deux se rejoignent
 * volontairement : « Présences » se vend et se coupe sous le même nom, sinon
 * personne ne saurait plus ce qui a été acheté.
 */

export type ModuleRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  billingPeriod: string;
  isActive: boolean;
};

export type ModuleInput = {
  code: string;
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  billingPeriod: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME';
  isActive: boolean;
};

export async function listModules(): Promise<ModuleRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('modules')
    .select('id, code, name, description, price_amount, currency, billing_period, is_active')
    .order('name');
  return ((data ?? []) as {
    id: string;
    code: string;
    name: string;
    description: string;
    price_amount: number;
    currency: string;
    billing_period: string;
    is_active: boolean;
  }[]).map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    description: m.description,
    priceAmount: Number(m.price_amount),
    currency: m.currency,
    billingPeriod: m.billing_period,
    isActive: m.is_active,
  }));
}

function toRow(input: ModuleInput) {
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    price_amount: input.priceAmount,
    currency: input.currency.toUpperCase(),
    billing_period: input.billingPeriod,
    is_active: input.isActive,
  };
}

export async function saveModule(input: ModuleInput, id?: string): Promise<void> {
  await assertPlatformAdmin();
  const supabase = await createClient();
  if (id) {
    const { error, count } = await supabase.from('modules').update(toRow(input), { count: 'exact' }).eq('id', id);
    if (error) {
      if (error.code === '23505') throw new ConflictError('Un module porte déjà ce code.');
      throw error;
    }
    if (!count) throw new NotFoundError('Module introuvable.');
    return;
  }
  const { error } = await supabase.from('modules').insert(toRow(input));
  if (error) {
    if (error.code === '23505') throw new ConflictError('Un module porte déjà ce code.');
    throw error;
  }
}

export async function deleteModule(id: string): Promise<void> {
  await assertPlatformAdmin();
  const supabase = await createClient();
  const { error, count } = await supabase.from('modules').delete({ count: 'exact' }).eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Ce module est souscrit par un abonnement : désactivez-le plutôt.');
    throw error;
  }
  if (!count) throw new NotFoundError('Module introuvable.');
}
