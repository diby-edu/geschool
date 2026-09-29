'use client';

import { useEffect, useRef } from 'react';
import { Alert } from '@/components/ui/alert';

/**
 * Message d'erreur d'un formulaire de connexion.
 *
 * Sur téléphone, le message s'affiche AU-DESSUS des champs, donc hors écran
 * quand on vient d'appuyer sur « Se connecter » en bas, clavier ouvert : on a
 * l'impression que rien ne se passe. On l'amène donc sous les yeux, et on
 * l'annonce aux lecteurs d'écran.
 */
export function FormError({ message }: { message: string | undefined }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message) return;
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [message]);

  if (!message) return null;
  return (
    <div ref={ref} role="alert" aria-live="assertive">
      <Alert tone="error">{message}</Alert>
    </div>
  );
}
