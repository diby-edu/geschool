import Link from 'next/link';
import { Bell, Search } from 'lucide-react';
import { YearSwitcher } from '@/features/navigation/components/YearSwitcher';
import { AvatarMenu } from './AvatarMenu';

export type TopBarData = {
  slug: string;
  schoolName: string;
  /** « mardi 22 septembre 2026 », déjà dans le fuseau de l'établissement. */
  dateLabel: string;
  years: { id: string; name: string; isCurrent: boolean }[];
  yearId: string | null;
  yearIsCurrent: boolean;
  /** Recherche ouverte : élèves, enseignants ou personnel selon les droits. */
  canSearch: boolean;
  unreadNotifications: number;
  settingsHref: string | null;
  /** Page des années scolaires, quand la personne peut les consulter. */
  yearsHref: string | null;
  user: { displayName: string; roleLabel: string; photoUrl: string | null };
};

/**
 * Barre du haut de l'espace établissement : où l'on est (école, jour, année
 * scolaire), ce qu'on cherche, ce qui est nouveau (cloche), et qui est connecté
 * (photo → Paramètres, thème, déconnexion).
 */
export function TopBar({ data, live }: { data: TopBarData; live?: React.ReactNode }) {
  const base = `/e/${data.slug}`;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight">{data.schoolName}</p>
        <p className="truncate text-[11px] leading-tight text-[color:var(--muted-foreground)] first-letter:uppercase">{data.dateLabel}</p>
      </div>

      <YearSwitcher
        slug={data.slug}
        years={data.years}
        currentId={data.yearId}
        isCurrent={data.yearIsCurrent}
        manageHref={data.yearsHref}
      />

      {data.canSearch ? (
        <form action={`${base}/recherche`} className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-foreground)]" aria-hidden />
          <input
            type="search"
            name="q"
            placeholder="Rechercher un élève, un enseignant…"
            aria-label="Rechercher"
            className="h-9 w-full rounded-full border pl-9 pr-3 text-sm"
            style={{ backgroundColor: 'var(--surface)' }}
          />
        </form>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {live}
        <Link
          href={`${base}/notifications`}
          aria-label={data.unreadNotifications > 0 ? `Notifications : ${data.unreadNotifications} non lues` : 'Notifications'}
          className="relative grid h-9 w-9 place-items-center rounded-full border transition-colors hover:bg-[color:var(--color-brand-muted)]"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {data.unreadNotifications > 0 ? (
            <span
              className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white"
              style={{ backgroundColor: 'var(--color-danger)' }}
            >
              {data.unreadNotifications > 9 ? '9+' : data.unreadNotifications}
            </span>
          ) : null}
        </Link>
        <AvatarMenu
          name={data.user.displayName}
          roleLabel={data.user.roleLabel}
          photoUrl={data.user.photoUrl}
          settingsHref={data.settingsHref}
          profileHref={`${base}/profil`}
        />
      </div>
    </div>
  );
}
