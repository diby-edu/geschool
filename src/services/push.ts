import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';

/**
 * Notifications sur le téléphone (Web Push, 0171).
 *
 * Chaque appareil où l'utilisateur a accepté les notifications laisse une
 * adresse d'envoi (push_subscriptions). On y envoie titre, texte et lien ; le
 * service worker de l'application l'affiche, même téléphone verrouillé.
 *
 * Jamais bloquant : une notification sur téléphone qui échoue ne doit pas faire
 * échouer l'action qui l'a déclenchée (un appel, un paiement). Une adresse
 * refusée par le navigateur (appareil désinscrit) est supprimée.
 */

export type PushMessage = { type: string; title: string; body: string; href?: string };

export function pushConfigured(): boolean {
  const e = serverEnv();
  return Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string {
  return serverEnv().VAPID_PUBLIC_KEY;
}

/** Envoie à tous les appareils de ces personnes, sauf à qui a coupé ce type. */
export async function pushToUsers(userIds: string[], message: PushMessage): Promise<number> {
  return pushMany([{ userIds, message }]);
}

/**
 * Plusieurs messages différents d'un coup (une note par élève, à ses tuteurs) :
 * appareils et réglages lus une seule fois.
 */
export async function pushMany(items: { userIds: string[]; message: PushMessage }[]): Promise<number> {
  const all = [...new Set(items.flatMap((i) => i.userIds))];
  if (all.length === 0 || !pushConfigured()) return 0;
  try {
    const admin = createAdminClient('notifications.send');
    type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
    const subs: Sub[] = [];
    const muted = new Map<string, Set<string>>();
    for (let i = 0; i < all.length; i += 300) {
      const ids = all.slice(i, i + 300);
      const [{ data: s1 }, { data: p1 }] = await Promise.all([
        admin.from('push_subscriptions' as never).select('id, user_id, endpoint, p256dh, auth').in('user_id', ids),
        admin.from('notification_preferences' as never).select('user_id, muted').in('user_id', ids),
      ]);
      subs.push(...((s1 ?? []) as Sub[]));
      for (const p of (p1 ?? []) as { user_id: string; muted: string[] | null }[]) muted.set(p.user_id, new Set(p.muted ?? []));
    }
    if (subs.length === 0) return 0;
    const byUser = new Map<string, Sub[]>();
    for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

    const sends: { sub: Sub; payload: string }[] = [];
    for (const { userIds, message } of items) {
      const payload = JSON.stringify(message);
      for (const uid of new Set(userIds)) {
        if (muted.get(uid)?.has(message.type)) continue;
        for (const sub of byUser.get(uid) ?? []) sends.push({ sub, payload });
      }
    }
    if (sends.length === 0) return 0;

    const webpush = (await import('web-push')).default;
    const e = serverEnv();
    webpush.setVapidDetails(e.VAPID_SUBJECT, e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
    let sent = 0;
    const gone = new Set<string>();
    // Par paquets : un établissement entier peut viser des centaines d'appareils.
    for (let i = 0; i < sends.length; i += 50) {
      const batch = sends.slice(i, i + 50);
      const results = await Promise.allSettled(
        batch.map(({ sub, payload }) =>
          webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 12 * 3600 }),
        ),
      );
      results.forEach((r, k) => {
        if (r.status === 'fulfilled') sent += 1;
        else {
          const code = (r.reason as { statusCode?: number } | null)?.statusCode;
          // 404/410 : l'appareil s'est désinscrit, l'adresse ne servira plus.
          if (code === 404 || code === 410) gone.add(batch[k]!.sub.id);
        }
      });
    }
    if (gone.size > 0) await admin.from('push_subscriptions' as never).delete().in('id', [...gone]);
    return sent;
  } catch (error) {
    console.error('[push] envoi impossible', error);
    return 0;
  }
}

/**
 * Enregistre l'appareil d'une personne. Un téléphone passé d'une personne à une
 * autre garde la même adresse : elle change de propriétaire (service, car la
 * ligne ne lui appartient plus).
 */
export async function replacePushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string }, userAgent: string): Promise<void> {
  const admin = createAdminClient('notifications.send');
  await admin.from('push_subscriptions' as never).delete().eq('endpoint', sub.endpoint);
  const { error } = await admin.from('push_subscriptions' as never).insert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    user_agent: userAgent.slice(0, 300),
  } as never);
  if (error) throw new Error(error.message);
}
