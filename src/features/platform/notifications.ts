import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { ALERT_CHECKS } from './alerts-core';
import { notificationKind } from '@/features/notifications/catalog';

/**
 * La cloche du Super Admin (0171) : les alertes techniques ouvertes
 * (platform_alerts, 0154) et ses notifications (paiement reçu, nouvelle école,
 * message…), chacune lue pour lui.
 */

export type PlatformAlertRow = { key: string; icon: string; title: string; body: string; href: string; tone: 'danger' | 'warning'; openedAt: string };
export type PlatformNotificationRow = { id: string; type: string; icon: string; title: string; body: string; href: string | null; at: string; read: boolean };

export async function openPlatformAlerts(): Promise<PlatformAlertRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('platform_alerts' as never).select('key, message, opened_at').is('resolved_at', null).order('opened_at', { ascending: false });
  return ((data ?? []) as { key: string; message: string; opened_at: string }[]).map((a) => {
    const check = ALERT_CHECKS.find((c) => c.key === a.key);
    return {
      key: a.key,
      icon: check?.urgent ? '🔴' : '🟠',
      title: check?.label ?? a.key,
      body: a.message,
      href: '/admin/technique',
      tone: check?.urgent ? 'danger' : 'warning',
      openedAt: a.opened_at,
    };
  });
}

export async function listPlatformNotifications(userId: string, limit = 50): Promise<PlatformNotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('platform_notifications' as never)
    .select('id, type, title, body, href, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  const rows = (data ?? []) as { id: string; type: string; title: string; body: string; href: string | null; created_at: string }[];
  const { data: reads } = rows.length
    ? await supabase.from('platform_notification_reads' as never).select('notification_id').eq('user_id', userId).in('notification_id', rows.map((r) => r.id))
    : { data: [] };
  const read = new Set(((reads ?? []) as { notification_id: string }[]).map((r) => r.notification_id));
  return rows.map((r) => ({ id: r.id, type: r.type, icon: notificationKind(r.type).icon, title: r.title, body: r.body, href: r.href, at: r.created_at, read: read.has(r.id) }));
}

/** Le chiffre de la cloche : alertes ouvertes + notifications non lues des 30 derniers jours. */
export async function platformBellCount(userId: string): Promise<number> {
  const [alerts, notes] = await Promise.all([openPlatformAlerts(), listPlatformNotifications(userId, 100)]);
  const since = Date.now() - 30 * 86_400_000;
  return alerts.length + notes.filter((n) => !n.read && Date.parse(n.at) >= since).length;
}

export async function markPlatformNotificationsRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = await createClient();
  await supabase
    .from('platform_notification_reads' as never)
    .upsert(ids.map((id) => ({ notification_id: id, user_id: userId })) as never, { onConflict: 'notification_id,user_id', ignoreDuplicates: true });
}
