'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';

type Item = { key: string; icon: string; title: string; body: string; href: string | null; tone: 'danger' | 'warning' | 'info'; when?: string; unread?: boolean };
type Payload = {
  alerts: { key: string; icon: string; title: string; body: string; href: string; tone: 'danger' | 'warning' }[];
  notifications: { id: string; icon: string; title: string; body: string; at: string; read: boolean; href: string | null }[];
};

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * La cloche (maquette Alertes et notifications, partie 1) : le chiffre rouge
 * compte les alertes en cours et les notifications non lues ; au clic, un menu
 * les montre, les alertes d'abord. « Tout voir » mène à la page complète.
 * Le contenu n'est lu qu'à l'ouverture du menu.
 */
export function BellMenu({ apiHref, pageHref, count }: { apiHref: string; pageHref: string; count: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(apiHref, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Payload>) : null))
      .then((p) => {
        if (!alive || !p) return;
        setItems([
          ...p.alerts.map((a) => ({ key: `a-${a.key}`, icon: a.icon, title: a.title, body: a.body, href: a.href, tone: a.tone })),
          ...p.notifications.map((n) => ({ key: n.id, icon: n.icon, title: n.title, body: n.body, href: n.href, tone: 'info' as const, when: ago(n.at), unread: !n.read })),
        ]);
      })
      .catch(() => setItems([]));
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      alive = false;
      document.removeEventListener('mousedown', close);
    };
  }, [open, apiHref]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={count > 0 ? `Alertes et notifications : ${count}` : 'Alertes et notifications'}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-full border transition-colors hover:bg-[color:var(--color-brand-muted)]"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {count > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ backgroundColor: 'var(--color-danger)' }}
          >
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border shadow-xl"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5 text-sm font-bold" style={{ borderColor: 'var(--border)' }}>
            À voir maintenant
            <Link href={pageHref} onClick={() => setOpen(false)} className="text-xs font-bold text-[color:var(--color-brand)] hover:underline">
              Tout voir →
            </Link>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-4 text-sm text-[color:var(--muted-foreground)]">Chargement…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-4 text-sm text-[color:var(--muted-foreground)]">✓ Tout va bien : aucune alerte, aucune notification.</p>
            ) : (
              items.map((it) => {
                const dot = it.tone === 'danger' ? 'var(--color-danger)' : it.tone === 'warning' ? 'var(--color-warning)' : 'var(--color-brand)';
                const body = (
                  <span className="flex gap-2.5 px-4 py-2.5 text-sm">
                    <span aria-hidden className="mt-0.5">{it.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold">
                        {it.unread || it.tone !== 'info' ? <span className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} /> : null}
                        <span className="truncate">{it.title}</span>
                      </span>
                      <span className="block text-xs text-[color:var(--muted-foreground)]">{it.body}</span>
                      <span className="block text-[11px] text-[color:var(--muted-foreground)]">{it.tone === 'info' ? (it.when ?? '') : 'Alerte en cours'}</span>
                    </span>
                  </span>
                );
                return (
                  <div key={it.key} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    {it.href ? (
                      <Link href={it.href} onClick={() => setOpen(false)} className="block hover:bg-[color:var(--color-brand-muted)]">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
