import Link from 'next/link';
import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { NavLinks } from './NavLinks';
import { ModuleScope } from './ModuleScope';
import { ThemeToggle } from './ThemeToggle';
import { AppLogo } from './AppLogo';
import { TopBar, type TopBarData } from './TopBar';

export type { NavItem } from './nav-modules';
import type { NavItem } from './nav-modules';

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
  back,
  headerExtra,
  topBar,
  children,
}: {
  brand: string;
  subtitle: string;
  nav: NavItem[];
  user: { displayName: string; roleLabel: string };
  /** Lien de sortie vers l'espace parent (ex. un Super Admin entré dans une école). */
  back?: { href: string; label: string };
  /** Element optionnel de l'en-tete (ex. bascule entre espaces, voyant « en direct »). */
  headerExtra?: React.ReactNode;
  /** Barre du haut complete (espace etablissement) : ecole, date, annee, recherche, cloche, photo. */
  topBar?: TopBarData;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b md:border-b-0 md:border-r" style={{ backgroundColor: 'var(--surface)' }}>
        {back ? (
          <Link
            href={back.href}
            className="flex items-center gap-1.5 px-4 pt-3 text-xs font-medium text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
          >
            <span aria-hidden="true">&larr;</span> {back.label}
          </Link>
        ) : null}
        <div className="p-4">
          {topBar ? (
            // Le logo de l'application tient la place du nom de l'ecole : celui-ci
            // est dans la barre du haut, avec le jour et l'annee scolaire.
            <Link href={`/e/${topBar.slug}/dashboard`} aria-label="Accueil">
              <AppLogo />
            </Link>
          ) : (
            <>
              <p className="truncate font-semibold tracking-tight">{brand}</p>
              <p className="truncate text-xs text-[color:var(--muted-foreground)]">{subtitle}</p>
            </>
          )}
        </div>
        <NavLinks items={nav} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header
          className="flex items-center justify-between gap-4 border-b px-5 py-3"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          {topBar ? (
            <TopBar data={topBar} live={headerExtra} />
          ) : (
            <>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.displayName}</p>
                <p className="truncate text-xs text-[color:var(--muted-foreground)]">{user.roleLabel}</p>
              </div>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                {headerExtra}
                <LogoutButton />
              </div>
            </>
          )}
        </header>

        <main className="min-w-0 flex-1 p-5">
          {/* Couleurs du module de la page (en-tête, tuiles, tableaux) : voir ModuleScope. */}
          <ModuleScope>{children}</ModuleScope>
        </main>
      </div>
    </div>
  );
}
