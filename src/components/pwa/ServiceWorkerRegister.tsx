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
    if (process.env.NODE_ENV !== 'production') {
      // Ne pas l'enregistrer ne suffit pas : un Service Worker installe AVANT
      // (build de production lance sur la meme adresse, ancienne version) reste
      // actif et continue de servir ses copies perimees (vu le 2026-09-22 : les
      // styles et formulaires modifies n'apparaissaient plus). On le retire,
      // avec son cache.
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => undefined);
      if ('caches' in window) {
        void caches
          .keys()
          .then((keys) => Promise.all(keys.filter((k) => k.startsWith('geschool-')).map((k) => caches.delete(k))))
          .catch(() => undefined);
      }
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* environnement sans support (ex. navigateur en mode prive strict) : degrade sans casser l'app */
    });
  }, []);

  return null;
}
