'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, Settings, UserRound } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { LogoutButton } from '@/features/auth/components/LogoutButton';

/**
 * Photo de la personne connectée, en haut à droite : elle remplace le bouton
 * « Se déconnecter ». Un clic déplie Paramètres, Ma photo, le thème clair/sombre
 * et la déconnexion.
 */
export function AvatarMenu({
  name,
  roleLabel,
  photoUrl,
  settingsHref,
  profileHref,
}: {
  name: string;
  roleLabel: string;
  photoUrl: string | null;
  /** null quand la personne n'a pas accès aux Paramètres. */
  settingsHref: string | null;
  profileHref: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') setOpen(false);
        return;
      }
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu de ${name}`}
        className="flex items-center gap-2 rounded-full border p-0.5 pr-2.5 transition-colors hover:bg-[color:var(--color-brand-muted)]"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL signée du stockage, durée courte
          <img src={photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full text-xs font-extrabold" style={{ backgroundColor: 'var(--color-brand-muted)', color: 'var(--color-brand)' }}>
            {initials}
          </span>
        )}
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[10rem] truncate text-xs font-semibold leading-tight">{name}</span>
          <span className="block max-w-[10rem] truncate text-[11px] leading-tight text-[color:var(--muted-foreground)]">{roleLabel}</span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 space-y-1 rounded-2xl border p-2 shadow-lg"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          <Link href={profileHref} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-[color:var(--color-brand-muted)]">
            <UserRound className="h-4 w-4" aria-hidden /> Ma photo et mon profil
          </Link>
          {settingsHref ? (
            <Link href={settingsHref} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-[color:var(--color-brand-muted)]">
              <Settings className="h-4 w-4" aria-hidden /> Paramètres
            </Link>
          ) : null}
          <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm">
            <span>Thème</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2 border-t px-1 pt-1.5 text-sm">
            <LogOut className="ml-2 h-4 w-4 text-[color:var(--muted-foreground)]" aria-hidden />
            <LogoutButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}
