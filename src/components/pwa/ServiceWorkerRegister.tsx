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
    // Jamais en developpement : les fichiers de _next/static ne sont pas
    // hashes par contenu en mode dev (Turbopack reutilise les memes noms
    // d'un changement a l'autre), donc le cache-first du Service Worker sert
    // indefiniment une version perimee des composants client — un onglet ou
    // il s'enregistre une fois ne revoit plus jamais un changement de code
    // tant qu'on ne le desinscrit pas a la main. Sans consequence en
    // production (ADR-014, artefacts precompiles et hashes a chaque deploi).
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* environnement sans support (ex. navigateur en mode prive strict) : degrade sans casser l'app */
    });
  }, []);

  return null;
}
