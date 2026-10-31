'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { listPlatformNotifications, markPlatformNotificationsRead } from './notifications';

/** « Tout marquer comme lu » dans la cloche du Super Admin. */
export async function markAllPlatformReadAction(): Promise<void> {
  const user = await getAuthenticatedUser();
  if (!user) return;
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc('is_platform_admin' as never);
  if (isAdmin !== true) return;
  const notes = await listPlatformNotifications(user.id, 200);
  await markPlatformNotificationsRead(user.id, notes.filter((n) => !n.read).map((n) => n.id));
  revalidatePath('/admin', 'layout');
}
