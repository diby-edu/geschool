import type { Metadata } from 'next';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Hors ligne' };

/**
 * Filet de secours servi par le Service Worker quand une page n'a encore
 * jamais ete visitee en ligne sur cet appareil (donc rien a montrer en
 * cache). Volontairement generique et sans donnee : cette page elle-meme
 * est pre-mise en cache a l'installation du Service Worker.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <Card>
          <CardContent className="space-y-2 py-8">
            <p className="text-lg font-semibold">Vous êtes hors ligne</p>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Cette page n&apos;a pas encore été consultée sur cet appareil. Reconnectez-vous à internet
              pour y accéder, ou ouvrez une page déjà visitée précédemment.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
