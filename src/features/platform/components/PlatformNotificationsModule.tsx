import Link from 'next/link';
import { listPlatformNotifications, openPlatformAlerts } from '../notifications';

/**
 * Le module « Alertes et notifications » en haut du poste de pilotage (maquette,
 * partie 1) : alertes techniques ouvertes, puis dernières notifications non
 * lues. Sans rien à signaler, une ligne verte « Tout va bien ».
 */
export async function PlatformNotificationsModule({ userId }: { userId: string }) {
  const [alerts, notes] = await Promise.all([openPlatformAlerts(), listPlatformNotifications(userId, 30)]);
  const unread = notes.filter((n) => !n.read);

  if (alerts.length === 0 && unread.length === 0) {
    return (
      <Link
        href="/admin/notifications"
        className="flex items-center justify-between rounded-2xl border px-4 py-2.5 text-sm font-semibold"
        style={{ borderColor: 'color-mix(in srgb, var(--color-success) 35%, transparent)', background: 'color-mix(in srgb, var(--color-success) 8%, transparent)', color: 'var(--color-success)' }}
      >
        <span>✓ Tout va bien : aucune alerte, aucune notification non lue.</span>
        <span className="text-xs">Alertes et notifications →</span>
      </Link>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border-2" style={{ borderColor: 'color-mix(in srgb, var(--color-danger) 30%, transparent)', background: 'var(--surface)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-white" style={{ background: 'linear-gradient(115deg, #c8245a, #e8577f)' }}>
        <h2 className="text-base font-extrabold">🔔 Alertes et notifications</h2>
        <span className="text-xs opacity-90">
          {alerts.length} alerte{alerts.length > 1 ? 's' : ''} ouverte{alerts.length > 1 ? 's' : ''} · {unread.length} non lue{unread.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid md:grid-cols-[1.2fr_1fr]">
        <div className="py-2">
          <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">Alertes ouvertes</p>
          {alerts.length === 0 ? (
            <p className="px-4 py-2 text-sm font-semibold text-[color:var(--color-success)]">✓ Aucune alerte</p>
          ) : (
            alerts.slice(0, 4).map((a) => (
              <Link key={a.key} href={a.href} className="flex items-start gap-2.5 px-4 py-2 text-sm hover:bg-[color:var(--color-brand-muted)]">
                <span className="mt-1.5 inline-block size-2.5 shrink-0 rounded-full" style={{ background: a.tone === 'danger' ? 'var(--color-danger)' : 'var(--color-warning)' }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.title}</span>
                  <span className="block text-xs text-[color:var(--muted-foreground)]">{a.body}</span>
                </span>
              </Link>
            ))
          )}
        </div>
        <div className="border-t py-2 md:border-l md:border-t-0" style={{ borderColor: 'var(--border)' }}>
          <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">Notifications</p>
          {unread.length === 0 ? (
            <p className="px-4 py-2 text-sm text-[color:var(--muted-foreground)]">Rien de nouveau.</p>
          ) : (
            unread.slice(0, 4).map((n) => (
              <Link key={n.id} href={n.href ?? '/admin/notifications'} className="flex items-start gap-2.5 px-4 py-2 text-sm hover:bg-[color:var(--color-brand-muted)]">
                <span aria-hidden>{n.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{n.title}</span>
                  <span className="block truncate text-xs text-[color:var(--muted-foreground)]">{n.body}</span>
                </span>
              </Link>
            ))
          )}
          <Link href="/admin/notifications" className="block px-4 pt-1 text-xs font-bold text-[color:var(--color-brand)] hover:underline">
            Tout voir →
          </Link>
        </div>
      </div>
    </section>
  );
}
