import Link from 'next/link';
import type { Child } from '../children';
import { ParentPaywall } from './ParentPaywall';

export type ParentTab = 'mes-absences' | 'mes-notes' | 'mes-bulletins' | 'mon-emploi-du-temps' | 'notifications';

const TABS: { path: ParentTab; icon: string; label: string }[] = [
  { path: 'mes-absences', icon: '📋', label: 'Absences' },
  { path: 'mes-notes', icon: '📝', label: 'Moyennes' },
  { path: 'mes-bulletins', icon: '📄', label: 'Bulletins' },
  { path: 'mon-emploi-du-temps', icon: '📅', label: 'Emploi du t.' },
  { path: 'notifications', icon: '🔔', label: 'Notifs' },
];

/**
 * Le cadre des pages de l'Espace Parent (maquette espace-parent.html, v3) : un
 * onglet par enfant EN HAUT, cinq onglets EN BAS pour l'enfant choisi. Un
 * enfant non payé n'ouvre que l'écran de paiement : rien n'est gratuit (0172).
 */
export function ParentChrome({
  slug,
  kids,
  current,
  path,
  price,
  unread = 0,
  children,
}: {
  slug: string;
  kids: Child[];
  current: Child | null;
  path: ParentTab | 'dashboard';
  price: number;
  unread?: number;
  children: React.ReactNode;
}) {
  const base = `/e/${slug}`;
  const here = path === 'dashboard' ? `${base}/dashboard` : `${base}/${path}`;
  const locked = current !== null && !current.unlocked;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24 md:pb-6">
      {kids.length > 0 ? (
        <nav aria-label="Mes enfants" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {kids.map((k) => {
            const on = current?.id === k.id;
            return (
              <Link
                key={k.id}
                href={`${here}?enfant=${k.id}`}
                scroll={false}
                aria-current={on ? 'page' : undefined}
                className="shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-bold"
                style={on ? { background: '#f2711b', borderColor: '#f2711b', color: '#fff' } : { borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                {k.name.split(' ').slice(1).join(' ') || k.name}
                {k.unlocked ? '' : ' 🔒'}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {locked ? <ParentPaywall slug={slug} kids={kids} price={price} /> : children}

      <nav
        aria-label="Rubriques"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t md:hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((t) => {
          const on = t.path === path;
          const href = `${base}/${t.path}${current && t.path !== 'notifications' ? `?enfant=${current.id}` : ''}`;
          return (
            <Link
              key={t.path}
              href={href}
              aria-current={on ? 'page' : undefined}
              className="relative flex flex-col items-center gap-0.5 py-2 text-[10.5px]"
              style={on ? { color: '#f2711b', fontWeight: 800 } : { color: 'var(--muted-foreground)' }}
            >
              <span aria-hidden className="text-lg leading-none">
                {t.icon}
              </span>
              {t.label}
              {t.path === 'notifications' && unread > 0 ? (
                <span className="absolute right-[22%] top-1 rounded-full px-1.5 text-[9.5px] font-bold text-white" style={{ background: 'var(--color-danger)' }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
