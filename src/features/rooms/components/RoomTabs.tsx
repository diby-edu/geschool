import Link from 'next/link';

/**
 * Les onglets du module Salles.
 *
 * « Types et équipements » est un écran à part entière (sa propre adresse),
 * mais il appartient au même module : il doit se présenter comme un onglet, pas
 * comme un bouton perdu à côté de « Nouvelle salle ».
 */
const TABS = [
  { key: 'salles', label: 'Salles' },
  { key: 'affectation', label: 'Affectation aux classes' },
  { key: 'libres', label: 'Salles libres' },
  { key: 'types', label: 'Types et équipements' },
] as const;

export type RoomTabKey = (typeof TABS)[number]['key'];

export function RoomTabs({ base, current }: { base: string; current: RoomTabKey }) {
  return (
    <nav aria-label="Sections des salles" className="mb-4 flex flex-wrap gap-1.5">
      {TABS.map((t) => {
        const active = t.key === current;
        // L'onglet des types a sa propre page ; les autres sont des vues de la liste.
        const href = t.key === 'types' ? `${base}/types` : `${base}?onglet=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
            style={
              active
                ? {
                    backgroundColor: 'var(--color-brand)',
                    color: 'var(--color-brand-foreground)',
                    borderColor: 'var(--color-brand)',
                  }
                : { backgroundColor: 'var(--surface)', color: 'var(--muted-foreground)' }
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
