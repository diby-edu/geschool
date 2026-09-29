import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requireFeature } from '@/lib/permissions/guard';
import { availableSpaces, SPACE_HINTS, SPACE_LABELS } from '@/features/navigation/spaces';
import { switchSpaceAction } from '@/features/navigation/actions';
import { PageHeader } from '@/components/layout/PageHeader';

export const metadata: Metadata = { title: 'Choisir un espace' };

/**
 * Ecran propose a une personne qui cumule plusieurs roles (enseignant et parent,
 * par exemple) : elle choisit l'espace a ouvrir. Le choix est retenu sur
 * l'appareil ; la bascule reste disponible dans l'en-tete.
 */
export default async function ChooseSpacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requireFeature(ctx, 'parent_portal');
  const spaces = availableSpaces(ctx);
  // Un seul espace : rien à choisir, on l'ouvre directement.
  if (spaces.length < 2) redirect(`/e/${slug}`);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Quel espace ouvrir ?"
        description="Vous avez plusieurs rôles dans cet établissement. Vous pourrez changer d'espace à tout moment depuis l'en-tête."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {spaces.map((space) => (
          <form key={space} action={switchSpaceAction.bind(null, slug, space)}>
            <button
              type="submit"
              className="w-full rounded-[--radius-card] border p-5 text-left hover:bg-[color:var(--color-brand-muted)]"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              <span className="block text-base font-semibold">Espace {SPACE_LABELS[space]}</span>
              <span className="mt-1 block text-sm text-[color:var(--muted-foreground)]">{SPACE_HINTS[space]}</span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
