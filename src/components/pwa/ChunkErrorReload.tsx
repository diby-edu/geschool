'use client';

import { useEffect } from 'react';

const CHUNK_ERROR_PATTERN = /Loading chunk|ChunkLoadError|Failed to load chunk|Importing a module script failed/i;
const RELOADED_FLAG = 'geschool.chunk-reload.pending';

/**
 * Filet de securite deploiement : un onglet reste ouvert pendant qu'une
 * nouvelle version est mise en ligne (fichiers JS renommes par hash) tente de
 * charger un fragment qui n'existe plus -> ChunkLoadError. Cas connu meme sans
 * Service Worker ; le cache "reseau d'abord" du notre peut en plus servir une
 * page HTML perimee referencant des fragments d'une build encore plus
 * ancienne. Plutot que de laisser l'ecran d'erreur generique, on recharge une
 * fois pour repartir sur la version courante — jamais en boucle (drapeau
 * sessionStorage).
 */
export function ChunkErrorReload() {
  useEffect(() => {
    // Ce montage a reussi (pas d'erreur de chargement) : la page est saine,
    // le prochain vrai incident merite a nouveau un rechargement.
    const clear = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOADED_FLAG);
      } catch {
        /* ignore */
      }
    }, 4000);

    function handle(message: string) {
      if (!CHUNK_ERROR_PATTERN.test(message)) return;
      let already = false;
      try {
        already = sessionStorage.getItem(RELOADED_FLAG) === '1';
        if (!already) sessionStorage.setItem(RELOADED_FLAG, '1');
      } catch {
        /* stockage indisponible : on tente quand meme un seul rechargement */
      }
      if (!already) window.location.reload();
    }

    function onError(event: ErrorEvent) {
      handle(event.message || String(event.error ?? ''));
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      handle(typeof reason === 'string' ? reason : (reason?.message ?? String(reason)));
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.clearTimeout(clear);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
