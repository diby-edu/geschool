import Link from 'next/link';
import { LogoutButton } from '@/features/auth/components/LogoutButton';

export type NavItem = { href: string; label: string };

/**
 * Coquille commune a tous les espaces : barre laterale, en-tete, zone de
 * contenu. Les items de navigation sont fournis par l'espace appelant, deja
 * filtres selon les permissions — la coquille n'affiche jamais un lien vers
 * une page a laquelle l'utilisateur n'a pas acces.
 */
export function AppShell({
  brand,
  subtitle,
  nav,
  user,
  children,
}: {
  brand: string;
  subtitle: string;
  nav: NavItem[];
  user: { displayName: string; roleLabel: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b md:border-b-0 md:border-r" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="p-4">
          <p className="truncate font-semibold tracking-tight">{brand}</p>
          <p className="truncate text-xs text-[color:var(--muted-foreground)]">{subtitle}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-[--radius-card] px-3 py-2 text-sm text-[color:var(--foreground)] hover:bg-[color:var(--color-brand-muted)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header
          className="flex items-center justify-between gap-4 border-b px-5 py-3"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate text-xs text-[color:var(--muted-foreground)]">{user.roleLabel}</p>
          </div>
          <LogoutButton />
        </header>

        <main className="min-w-0 flex-1 p-5">{children}</main>
      </div>
    </div>
  );
}
