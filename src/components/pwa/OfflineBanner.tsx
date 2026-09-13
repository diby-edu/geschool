'use client';

import { useEffect, useState } from 'react';

/**
 * Bandeau permanent tant que le navigateur se sait hors ligne. Ne pretend
 * jamais que les donnees affichees sont a jour — c'est tout son role.
 */
export function OfflineBanner() {
  // Demarre aligne sur le rendu serveur (jamais hors ligne) : `navigator`
  // n'existe pas cote serveur, la vraie valeur n'est connue qu'une fois
  // monte cote client — evite un ecart d'hydratation.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    // Etat initial reel, differe hors du corps synchrone de l'effet.
    queueMicrotask(() => setOffline(!navigator.onLine));
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium"
      style={{ backgroundColor: 'var(--color-warning)', color: '#3a2a00' }}
    >
      <span aria-hidden="true">⚠</span>
      Hors ligne — vous consultez la dernière version enregistrée de cette page.
    </div>
  );
}
