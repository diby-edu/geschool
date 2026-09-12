import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AuthorizationError, ConflictError, NotFoundError } from '@/lib/errors';
import type { PlanInput, SubscriptionInput } from './schemas';
import type { PlanRow } from './types';

export type { PlanRow } from './types';

/** Défense en profondeur : les Server Actions plateforme la vérifient, en plus
 * de la garde de l'espace /admin et des policies RLS SaaS. */
export async function assertPlatformAdmin(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('is_platform_admin' as never);
  if (data !== true) throw new AuthorizationError('Réservé à l’administration de la plateforme.');
}

/**
 * Opérations de facturation réservées au Super Admin. Elles s'exécutent avec le
 * client RLS : les policies SaaS (0026) n'autorisent l'écriture des plans et des
 * abonnements qu'à `app.is_platform_admin()`. La garde d'accès de l'espace
 * /admin ferme déjà la porte en amont.
 */

export async function listPlans(): Promise<PlanRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('plans')
    .select('id, code, name, price_amount, currency, billing_period, is_public, is_active, limits')
    .order('price_amount');
  return ((data ?? []) as unknown as PlanRow[]).map((p) => ({ ...p, price_amount: Number(p.price_amount) }));
}

function planRow(input: PlanInput) {
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    price_amount: input.priceAmount,
    currency: input.currency.toUpperCase(),
    billing_period: input.billingPeriod,
    limits: {
      students: input.limitStudents,
      users: input.limitUsers,
      storageMb: input.limitStorageMb,
      sms: input.limitSms,
    } as unknown as Record<string, never>,
    is_public: input.isPublic,
    is_active: input.isActive,
  };
}

export async function savePlan(input: PlanInput, id?: string): Promise<void> {
  const supabase = await createClient();
  if (id) {
    const { error, count } = await supabase.from('plans').update(planRow(input), { count: 'exact' }).eq('id', id);
    if (error) {
      if (error.code === '23505') throw new ConflictError('Un plan porte déjà ce code.');
      throw error;
    }
    if (!count) throw new NotFoundError('Plan introuvable.');
  } else {
    const { error } = await supabase.from('plans').insert(planRow(input));
    if (error) {
      if (error.code === '23505') throw new ConflictError('Un plan porte déjà ce code.');
      throw error;
    }
  }
}

export async function deletePlan(id: string): Promise<void> {
  const supabase = await createClient();
  const { error, count } = await supabase.from('plans').delete({ count: 'exact' }).eq('id', id);
  if (error) {
    if (error.code === '23503') throw new ConflictError('Ce plan est utilisé par un abonnement.');
    throw error;
  }
  if (!count) throw new NotFoundError('Plan introuvable.');
}

// --- Abonnement d'un établissement -------------------------------------------

export async function getSchoolSubscription(schoolId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('id, plan_id, status, trial_ends_at, current_period_start, current_period_end, plans(name, price_amount, currency, billing_period)')
    .eq('school_id', schoolId)
    .in('status', ['TRIALING', 'ACTIVE', 'PAST_DUE'])
    .maybeSingle();
  return data as unknown as {
    id: string;
    plan_id: string;
    status: string;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    plans: { name: string; price_amount: number; currency: string; billing_period: string } | null;
  } | null;
}

/**
 * Assigne (ou met à jour) l'abonnement vivant d'un établissement. L'index
 * partiel « un seul abonnement vivant » garantit l'unicité : on met à jour s'il
 * en existe déjà un, sinon on en crée un.
 */
export async function assignSubscription(schoolId: string, input: SubscriptionInput): Promise<void> {
  const supabase = await createClient();
  const patch = {
    plan_id: input.planId,
    status: input.status,
    trial_ends_at: input.trialEndsAt ? input.trialEndsAt : null,
    current_period_start: input.periodStart ? input.periodStart : null,
    current_period_end: input.periodEnd ? input.periodEnd : null,
  };

  const existing = await getSchoolSubscription(schoolId);
  if (existing) {
    const { error } = await supabase.from('subscriptions').update(patch).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('subscriptions').insert({ school_id: schoolId, ...patch });
    if (error) {
      if (error.code === '23505') throw new ConflictError('Cet établissement a déjà un abonnement vivant.');
      throw error;
    }
  }
}
