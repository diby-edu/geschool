'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Ferme le panneau ouvert avec la touche Échap (le lien « Fermer » reste disponible sans script). */
export function EscapeClose({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(href, { scroll: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [href, router]);
  return null;
}
