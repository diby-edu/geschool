import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant/context';
import { toAppError } from '@/lib/errors';
import { listNotifications } from '@/features/communication/inbox';
import { loadSchoolAlerts } from '@/features/notifications/school-alerts';
import { notificationKind } from '@/features/notifications/catalog';

/**
 * Le menu de la cloche (maquette Alertes et notifications) : les alertes en
 * cours et les dernières notifications, lus seulement quand on ouvre le menu —
 * pas à chaque page.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const ctx = await getTenantContext(slug);
    const [alerts, notifications] = await Promise.all([loadSchoolAlerts(ctx), listNotifications(ctx, 6)]);
    return NextResponse.json({
      alerts,
      notifications: notifications.map((n) => {
        const kind = notificationKind(n.type);
        return {
          id: n.id,
          icon: kind.icon,
          title: n.title,
          body: n.body,
          at: n.created_at,
          read: n.read,
          href: n.requestId ? `/e/${slug}/plateforme/${n.requestId}` : kind.href ? `/e/${slug}${kind.href}` : null,
        };
      }),
    });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json({ error: appError.toClient() }, { status: appError.httpStatus });
  }
}
