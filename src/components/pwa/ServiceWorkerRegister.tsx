'use client';

import { useEffect } from 'react';

/**
 * Enregistre le Service Worker (hors ligne + installation sur l'ecran
 * d'accueil). Ne rend rien : composant purement d'effet de bord, monte une
 * fois dans le layout racine.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* environnement sans support (ex. navigateur en mode prive strict) : degrade sans casser l'app */
    });
  }, []);

  return null;
}
