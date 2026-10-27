import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  /** Une réponse de la plateforme mène à sa demande (lot 5). */
  requestId: string | null;
};

/** Boîte de réception de l'utilisateur courant (RLS : ses notifications seules). */
export async function listNotifications(ctx: TenantContext, limit = 50): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, created_at, read_at, entity_type, entity_id')
    .eq('school_id', ctx.school.id)
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  type Raw = { id: string; type: string; title: string; body: string; created_at: string; read_at: string | null; entity_type: string | null; entity_id: string | null };
  return ((data ?? []) as Raw[]).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    created_at: n.created_at,
    read: n.read_at !== null,
    requestId: n.entity_type === 'platform_request' ? n.entity_id : null,
  }));
}

export async function unreadCount(ctx: TenantContext): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', ctx.school.id)
    .eq('user_id', ctx.user.id)
    .is('read_at', null);
  return count ?? 0;
}

export async function markRead(ctx: TenantContext, id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('school_id', ctx.school.id)
    .eq('user_id', ctx.user.id)
    .eq('id', id)
    .is('read_at', null);
}

export async function markAllRead(ctx: TenantContext): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('school_id', ctx.school.id)
    .eq('user_id', ctx.user.id)
    .is('read_at', null);
}

export type PlatformBanner = { id: string; title: string; body: string };

/**
 * Les messages « importants » de la plateforme pas encore lus (lot 5) : ils
 * restent en bandeau jusqu'à « J'ai compris », ou jusqu'à leur date de fin.
 */
export async function platformBanners(ctx: TenantContext): Promise<PlatformBanner[]> {
  if (!ctx.membership) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, data')
    .eq('school_id', ctx.school.id)
    .eq('user_id', ctx.user.id)
    .eq('type', 'platform.message')
    .is('read_at', null)
    .eq('data->>importance', 'IMPORTANT')
    .order('created_at', { ascending: false })
    .limit(3);
  const today = new Date().toISOString().slice(0, 10);
  return ((data ?? []) as { id: string; title: string; body: string; data: { showUntil?: string | null } | null }[])
    .filter((n) => !n.data?.showUntil || n.data.showUntil >= today)
    .map((n) => ({ id: n.id, title: n.title, body: n.body }));
}
