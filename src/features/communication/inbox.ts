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
};

/** Boîte de réception de l'utilisateur courant (RLS : ses notifications seules). */
export async function listNotifications(ctx: TenantContext, limit = 50): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, created_at, read_at')
    .eq('school_id', ctx.school.id)
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as { id: string; type: string; title: string; body: string; created_at: string; read_at: string | null }[]).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    created_at: n.created_at,
    read: n.read_at !== null,
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
