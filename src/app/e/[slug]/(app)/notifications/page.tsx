import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { listNotifications } from '@/features/communication/inbox';
import { markReadAction, markAllReadAction } from '@/features/communication/actions';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);

  const notifications = await listNotifications(ctx);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} non lue(s)` : 'Tout est lu'}
        action={unread > 0 ? <SimpleSubmit action={markAllReadAction.bind(null, slug)} label="Tout marquer comme lu" small /> : null}
      />

      {notifications.length === 0 ? (
        <EmptyState title="Aucune notification" hint="Vos notifications apparaîtront ici." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Card className={n.read ? 'opacity-70' : ''}>
                <CardContent className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {!n.read ? <span className="inline-block size-2 rounded-full bg-[color:var(--color-brand)]" /> : null}
                      <span className="font-medium">{n.title}</span>
                    </div>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{n.body}</p>
                    <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">{new Date(n.created_at).toLocaleString('fr-FR')}</p>
                  </div>
                  {!n.read ? <SimpleSubmit action={markReadAction.bind(null, slug, n.id)} label="Lu" small /> : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
