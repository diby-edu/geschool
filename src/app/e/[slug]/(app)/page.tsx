import { notFound, redirect } from 'next/navigation';
import { isAppError } from '@/lib/errors';
import { getTenantContext } from '@/lib/tenant/context';
import { availableSpaces, getSavedSpace } from '@/features/navigation/spaces';

/**
 * Point d'entree de l'etablissement (destination apres connexion). Une personne
 * a un seul espace y va directement ; celle qui cumule plusieurs roles choisit
 * son espace la premiere fois, puis retrouve le dernier utilise.
 */
export default async function SchoolIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let ctx;
  try {
    ctx = await getTenantContext(slug);
  } catch (error) {
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'UNAUTHENTICATED')) notFound();
    throw error;
  }

  if (availableSpaces(ctx).length > 1 && !(await getSavedSpace(ctx))) redirect(`/e/${slug}/espace`);
  redirect(`/e/${slug}/dashboard`);
}
