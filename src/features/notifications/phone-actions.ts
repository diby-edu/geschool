'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getUserWithRetry } from '@/lib/supabase/get-user';
import { pushToUsers, replacePushSubscription } from '@/services/push';

/**
 * Le téléphone de chacun (0171) : s'abonner aux notifications, s'en désabonner,
 * couper un type, recevoir un essai. Valable pour tout compte connecté — école,
 * parent, Super Admin : chacun ne gère que SES appareils et SES réglages.
 */

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(4).max(100) }),
});

async function me(): Promise<string> {
  const user = await getUserWithRetry(await createClient());
  if (!user) throw new Error('Session expirée : reconnectez-vous.');
  return user.id;
}

export async function savePhoneAction(raw: unknown, userAgent: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const userId = await me();
    const sub = subscriptionSchema.parse(raw);
    await replacePushSubscription(userId, { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, userAgent);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Enregistrement impossible.' };
  }
}

export async function removePhoneAction(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  await supabase.from('push_subscriptions' as never).delete().eq('endpoint', endpoint);
  return { ok: true };
}

export async function setMutedAction(muted: string[]): Promise<{ ok: boolean }> {
  const userId = await me();
  const supabase = await createClient();
  const clean = [...new Set(muted.filter((t) => /^[a-z_.]{2,60}$/.test(t)))].slice(0, 60);
  await supabase
    .from('notification_preferences' as never)
    .upsert({ user_id: userId, muted: clean, updated_at: new Date().toISOString() } as never, { onConflict: 'user_id' });
  return { ok: true };
}

export async function testPhoneAction(): Promise<{ ok: boolean; sent: number }> {
  const userId = await me();
  const sent = await pushToUsers([userId], {
    type: 'test',
    title: 'Notifications activées',
    body: 'Les alertes et notifications de Gestion Scolaire arriveront sur ce téléphone.',
  });
  return { ok: sent > 0, sent };
}
