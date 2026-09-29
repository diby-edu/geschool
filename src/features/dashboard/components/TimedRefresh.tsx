'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Le total des appels « attendus » change à chaque FIN DE CRÉNEAU, sans qu'aucune donnée
 * ne soit écrite en base : aucun signal en direct ne peut le prévenir. On relit donc le
 * tableau de bord toutes les minutes, tant que l'onglet est visible, et dès qu'on y revient.
 * Les changements de données (un appel validé, une inscription) arrivent, eux, tout de
 * suite par LiveRefresh.
 */
export function TimedRefresh({ everySeconds = 60 }: { everySeconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const id = window.setInterval(tick, everySeconds * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router, everySeconds]);
  return null;
}
