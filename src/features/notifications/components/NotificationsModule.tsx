import Link from 'next/link';
import type { TenantContext } from '@/lib/tenant/context';
import { listNotifications } from '@/features/communication/inbox';
import { loadSchoolAlerts } from '../school-alerts';
import { notificationKind } from '../catalog';

/**
 * Le module « Alertes et notifications » en haut du tableau de bord (maquette,
 * partie 1) : les alertes en cours, puis les dernières notifications non lues.
 * Sans rien à signaler, il se réduit à une ligne verte « Tout va bien ».
 */
export async function NotificationsModule({ ctx }: { ctx: TenantContext }) {
  const base = `/e/${ctx.school.slug}`;
  const [alerts, notes] = await Promise.all([loadSchoolAlerts(ctx), listNotifications(ctx, 20)]);
  const unread = notes.filter((n) => !n.read);

  if (alerts.length === 0 && unread.length === 0) {
    return (
      <Link
        href={`${base}/notifications`}
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
          {alerts.length} alerte{alerts.length > 1 ? 's' : ''} en cours · {unread.length} non lue{unread.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid md:grid-cols-[1.2fr_1fr]">
        <div className="py-2">
          <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">Alertes en cours</p>
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
            unread.slice(0, 4).map((n) => {
              const kind = notificationKind(n.type);
              return (
                <Link key={n.id} href={`${base}/notifications`} className="flex items-start gap-2.5 px-4 py-2 text-sm hover:bg-[color:var(--color-brand-muted)]">
                  <span aria-hidden>{kind.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{n.title}</span>
                    <span className="block truncate text-xs text-[color:var(--muted-foreground)]">{n.body}</span>
                  </span>
                </Link>
              );
            })
          )}
          <Link href={`${base}/notifications`} className="block px-4 pt-1 text-xs font-bold text-[color:var(--color-brand)] hover:underline">
            Tout voir →
          </Link>
        </div>
      </div>
    </section>
  );
}
