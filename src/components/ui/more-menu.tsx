'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export type MoreMenuItem = { label: string; href: string; /** Téléchargement (route, pas une page) : lien simple. */ download?: boolean; danger?: boolean };

/** Ferme le menu au clic ailleurs ou avec Échap. */
function useCloseOutside() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
    };
  }, []);
  return ref;
}

/**
 * Menu « Plus ▾ » des en-têtes de page (maquette validée le 2026-10-30) : un
 * bouton principal reste visible, les actions secondaires passent dans ce menu
 * au lieu de déborder de l'écran. Se ferme au clic ailleurs ou avec Échap.
 */
export function MoreMenu({ label = 'Plus', items }: { label?: string; items: MoreMenuItem[] }) {
  const ref = useCloseOutside();
  if (items.length === 0) return null;
  return (
    <details ref={ref} className="relative">
      <summary
        className="flex h-10 cursor-pointer list-none items-center gap-1 rounded-[--radius-card] border px-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
      >
        {label} <ChevronDown className="h-4 w-4" aria-hidden />
      </summary>
      <div
        className="absolute right-0 z-30 mt-1.5 min-w-[14rem] rounded-xl border p-1.5 shadow-lg"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        role="menu"
      >
        {items.map((it) =>
          it.download ? (
            <a key={it.href} href={it.href} download role="menuitem" className="block rounded-lg px-3 py-2 text-sm hover:bg-[color:var(--muted)]">
              {it.label}
            </a>
          ) : (
            <Link
              key={it.href}
              href={it.href}
              role="menuitem"
              className="block rounded-lg px-3 py-2 text-sm hover:bg-[color:var(--muted)]"
              style={it.danger ? { color: 'var(--color-danger)' } : undefined}
            >
              {it.label}
            </Link>
          ),
        )}
      </div>
    </details>
  );
}

/**
 * Bouton « Actions ▾ » d'une ligne de tableau : les actions possibles pour CETTE
 * ligne (formulaires d'action passés en enfants), au lieu d'une rangée de
 * boutons qui déborde. Le menu s'ouvre vers la gauche, sous le bouton.
 */
export function ActionMenu({ label = 'Actions', children }: { label?: string; children: React.ReactNode }) {
  const ref = useCloseOutside();
  return (
    <details ref={ref} className="relative inline-block text-left">
      <summary
        className="flex h-8 cursor-pointer list-none items-center gap-1 rounded-xl border px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
      >
        {label} <ChevronDown className="h-4 w-4" aria-hidden />
      </summary>
      <div
        className="absolute right-0 z-30 mt-1.5 flex min-w-[15rem] flex-col items-stretch gap-1.5 rounded-xl border p-2 shadow-lg [&_button]:w-full [&_button]:justify-start"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        role="menu"
      >
        {children}
      </div>
    </details>
  );
}
