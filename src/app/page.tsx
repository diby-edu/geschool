import { publicEnv } from '@/lib/env';

/**
 * Page d'accueil provisoire.
 *
 * Elle indique l'etat REEL du projet et ne propose aucune action qui n'existe
 * pas encore (regle §77 : pas de bouton mort, pas de « bientot disponible »).
 * Elle sera remplacee par la page de connexion au lot 3.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {publicEnv.NEXT_PUBLIC_PLATFORM_NAME}
        </h1>
        <p className="mt-2 text-[color:var(--muted-foreground)]">
          Plateforme de gestion d&apos;établissements scolaires — socle technique en place.
        </p>
      </header>

      <section
        className="rounded-[--radius-card] border p-5"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          État du projet
        </h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt>Lot 1 — Socle technique</dt>
            <dd className="font-medium text-[color:var(--color-success)]">en place</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Lot 2 — Base de données et RLS</dt>
            <dd className="text-[color:var(--muted-foreground)]">à venir</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Lot 3 — Authentification</dt>
            <dd className="text-[color:var(--muted-foreground)]">à venir</dd>
          </div>
        </dl>
      </section>

      <p className="text-xs text-[color:var(--muted-foreground)]">
        La connexion sera disponible au lot 3. Le plan complet est dans{' '}
        <code className="font-mono">docs/IMPLEMENTATION_PLAN.md</code>.
      </p>
    </main>
  );
}
