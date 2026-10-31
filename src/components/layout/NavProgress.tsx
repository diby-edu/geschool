'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Une fine barre en haut de l'écran dès qu'on clique sur un lien interne, jusqu'à
 * l'arrivée de la nouvelle page. Le clic est ainsi visible tout de suite, même
 * quand le serveur met une seconde à répondre (2026-10-28 : on recliquait).
 */
export function NavProgress() {
  const here = `${usePathname()}?${useSearchParams().toString()}`;
  // L'adresse au moment du clic : la barre reste tant que l'on y est encore.
  const [from, setFrom] = useState<string | null>(null);
  // Arrivé ailleurs : la navigation est finie (mise à jour pendant le rendu, motif recommandé par React).
  if (from !== null && from !== here) setFrom(null);
  const active = from !== null && from === here;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:)/.test(href)) return;
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || url.pathname.includes('/telecharger') || url.pathname.startsWith('/api/')) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setFrom(`${location.pathname}?${location.search.replace(/^\?/, '')}`);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden" role="progressbar" aria-label="Chargement">
      <div className="nav-progress-bar h-full w-1/3" style={{ background: 'var(--color-brand)' }} />
    </div>
  );
}
