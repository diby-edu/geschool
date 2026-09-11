'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Frontiere d'erreur globale. Ne montre jamais le detail technique a
 * l'utilisateur — la cause part dans les logs serveur / Sentry.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error-boundary]', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Une erreur est survenue</h1>
      <p className="max-w-sm text-sm text-[color:var(--muted-foreground)]">
        Quelque chose s&apos;est mal passe. Reessayez ; si le probleme persiste, contactez le
        support.
      </p>
      <Button className="mt-2" onClick={reset}>
        Reessayer
      </Button>
    </main>
  );
}
