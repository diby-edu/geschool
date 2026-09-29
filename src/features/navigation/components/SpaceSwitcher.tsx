import type { Space } from '@/lib/permissions/roles';
import { switchSpaceAction } from '../actions';
import { SPACE_LABELS } from '../spaces';

/**
 * Bascule entre les espaces d'une personne qui cumule plusieurs roles. Rien
 * n'est affiche pour un role unique. Chaque bouton est un formulaire (Server
 * Action) : fonctionne sans JavaScript.
 */
export function SpaceSwitcher({ slug, current, spaces }: { slug: string; current: Space; spaces: readonly Space[] }) {
  if (spaces.length < 2) return null;
  return (
    <div
      role="group"
      aria-label="Changer d'espace"
      className="flex gap-1 rounded-[--radius-card] border p-1 text-xs"
      style={{ backgroundColor: 'var(--surface)' }}
    >
      {spaces.map((space) => (
        <form key={space} action={switchSpaceAction.bind(null, slug, space)}>
          <button
            type="submit"
            aria-pressed={space === current}
            className="rounded-[--radius-card] px-2.5 py-1.5 font-medium"
            style={
              space === current
                ? { background: 'var(--color-brand)', color: '#fff' }
                : { color: 'var(--muted-foreground)' }
            }
          >
            {SPACE_LABELS[space]}
          </button>
        </form>
      ))}
    </div>
  );
}
