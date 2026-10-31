import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listNotifications } from '@/features/communication/inbox';
import { markReadAction, markAllReadAction } from '@/features/communication/actions';
import { loadSchoolAlerts } from '@/features/notifications/school-alerts';
import { mutableTypes, notificationKind, type NotificationAudience } from '@/features/notifications/catalog';
import { PhoneNotifications } from '@/features/notifications/components/PhoneNotifications';
import { vapidPublicKey } from '@/services/push';
import { isStaffFunction } from '@/lib/permissions/roles';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Alertes et notifications' };

/**
 * Alertes et notifications (maquette docs/maquettes/alertes-et-notifications.html) :
 * ce qui ne va pas maintenant (alertes, selon les droits), ce qui s'est passé
 * (notifications), et ce qu'on reçoit sur son téléphone.
 */
export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  const supabase = await createClient();

  const [notifications, alerts, { data: prefs }] = await Promise.all([
    listNotifications(ctx),
    loadSchoolAlerts(ctx),
    supabase.from('notification_preferences' as never).select('muted').eq('user_id', ctx.user.id).maybeSingle(),
  ]);
  const unread = notifications.filter((n) => !n.read).length;

  const roles = ctx.membership?.roles ?? [];
  const audiences: NotificationAudience[] = [];
  if (roles.some((r) => r === 'SCHOOL_ADMIN' || isStaffFunction(r))) audiences.push('staff');
  if (roles.includes('TEACHER')) audiences.push('teacher');
  if (roles.includes('PARENT')) audiences.push('parent');
  const kinds = mutableTypes(audiences).map(({ type, kind }) => ({ type, label: kind.label, icon: kind.icon, who: kind.who }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Alertes et notifications"
        description={`${alerts.length} alerte${alerts.length > 1 ? 's' : ''} en cours · ${unread} notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}`}
        action={unread > 0 ? <SimpleSubmit action={markAllReadAction.bind(null, slug)} label="Tout marquer comme lu" small /> : null}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">Alertes en cours</h2>
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-3 text-sm font-semibold" style={{ color: 'var(--color-success)' }}>
              ✓ Tout va bien : aucune alerte.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="block">
                  <Card className="transition hover:shadow-md">
                    <CardContent className="flex items-start gap-3 py-3">
                      <span aria-hidden className="text-lg">{a.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold" style={{ color: a.tone === 'danger' ? 'var(--color-danger)' : undefined }}>
                          {a.title}
                        </span>
                        <span className="block text-sm text-[color:var(--muted-foreground)]">{a.body}</span>
                      </span>
                      <span className="text-sm font-semibold text-[color:var(--color-brand)]">Voir →</span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">Notifications</h2>
        {notifications.length === 0 ? (
          <Card>
            <CardContent className="py-3 text-sm text-[color:var(--muted-foreground)]">Aucune notification pour le moment.</CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => {
              const kind = notificationKind(n.type);
              const href = n.requestId ? `/e/${slug}/plateforme/${n.requestId}` : kind.href ? `/e/${slug}${kind.href}` : null;
              return (
                <li key={n.id}>
                  <Card className={n.read ? 'opacity-70' : ''}>
                    <CardContent className="flex items-start justify-between gap-3 py-3">
                      <div className="flex min-w-0 gap-3">
                        <span aria-hidden className="text-lg">{kind.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {!n.read ? <span className="inline-block size-2 rounded-full bg-[color:var(--color-brand)]" /> : null}
                            <span className="font-medium">{n.title}</span>
                          </div>
                          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{n.body}</p>
                          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                            {new Date(n.created_at).toLocaleString('fr-FR')}
                            {href ? (
                              <>
                                {' · '}
                                <Link href={href} className="font-semibold text-[color:var(--color-brand)] hover:underline">
                                  Voir
                                </Link>
                              </>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      {!n.read ? <SimpleSubmit action={markReadAction.bind(null, slug, n.id)} label="Lu" small /> : null}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">Sur ce téléphone</h2>
        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Recevez vos alertes et notifications même quand l’application est fermée. Gratuit, sans SMS.
            </p>
            <PhoneNotifications publicKey={vapidPublicKey()} kinds={kinds} muted={((prefs as { muted?: string[] } | null)?.muted ?? []) as string[]} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
