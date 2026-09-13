'use client';

import { logout } from '../actions';
import { Button } from '@/components/ui/button';

/**
 * Un poste partage (salle des profs) ne doit jamais laisser le prochain
 * utilisateur retrouver les pages mises en cache hors ligne du precedent :
 * on vide le cache du Service Worker au moment meme de la deconnexion.
 */
function clearOfflineCache() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHE' });
}

export function LogoutButton() {
  return (
    <form action={logout} onSubmit={clearOfflineCache}>
      <Button type="submit" variant="ghost" size="sm">
        Se deconnecter
      </Button>
    </form>
  );
}
