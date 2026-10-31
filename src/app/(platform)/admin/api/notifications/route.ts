import { NextResponse } from 'next/server';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { listPlatformNotifications, openPlatformAlerts } from '@/features/platform/notifications';

/** Le menu de la cloche du Super Admin : alertes ouvertes et dernières notifications. */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: { message: 'Non connecté.' } }, { status: 401 });
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc('is_platform_admin' as never);
  if (isAdmin !== true) return NextResponse.json({ error: { message: 'Introuvable.' } }, { status: 404 });

  const [alerts, notes] = await Promise.all([openPlatformAlerts(), listPlatformNotifications(user.id, 6)]);
  return NextResponse.json({
    alerts: alerts.map(({ openedAt: _o, ...a }) => a),
    notifications: notes.map((n) => ({ id: n.id, icon: n.icon, title: n.title, body: n.body, at: n.at, read: n.read, href: n.href })),
  });
}
