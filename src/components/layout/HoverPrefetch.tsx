'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Délai d'intention : balayer le menu à la souris ne lance pas dix pages sur un serveur à un seul processeur. */
const HOVER_INTENT_MS = 90;
/** Une page préchargée n'est pas redemandée avant ce délai (next.config.ts : staleTimes.static). */
const REUSE_MS = 30_000;
/**
 * Adresses qui ne sont pas des pages (route.ts) : exports, téléchargements, envois.
 * Les précharger lancerait l'export au simple survol, et l'inscrirait au journal.
 */
const NOT_A_PAGE = /(^|\/)(api|auth|export|telecharger|dossier|envoyer|sauvegarde)(\/|$)/;

/**
 * Préchargement de la page complète (données comprises) dès que la souris
 * s'arrête sur un lien interne, ou dès que le doigt le touche : au clic, la page
 * est souvent déjà là (2026-10-30 : une page met 0,5 à 1 s à préparer, le temps
 * entre survol et clic est du même ordre). Vaut pour tous les liens de l'espace,
 * sans toucher à chacun.
 */
export function HoverPrefetch() {
  const router = useRouter();

  useEffect(() => {
    const done = new Map<string, number>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hovered: string | null = null;

    const target = (e: Event): string | null => {
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download') || a.dataset.noPrefetch !== undefined) return null;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || /^(mailto:|tel:)/.test(href)) return null;
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || NOT_A_PAGE.test(url.pathname)) return null;
      if (url.pathname === location.pathname && url.search === location.search) return null;
      return url.pathname + url.search;
    };
    const prefetch = (href: string) => {
      const at = done.get(href);
      if (at !== undefined && Date.now() - at < REUSE_MS) return;
      done.set(href, Date.now());
      router.prefetch(href, { kind: 'full' as never });
    };

    const onOver = (e: MouseEvent) => {
      const href = target(e);
      if (href === hovered) return; // on bouge dans le même lien : le délai court toujours
      hovered = href;
      clearTimeout(timer);
      if (href) timer = setTimeout(() => prefetch(href), HOVER_INTENT_MS);
    };
    const onTouch = (e: TouchEvent) => {
      const href = target(e);
      if (href) prefetch(href);
    };
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('touchstart', onTouch, { passive: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('touchstart', onTouch);
    };
  }, [router]);

  return null;
}
