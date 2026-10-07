import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';

export const dynamic = 'force-dynamic';

/**
 * Raccourci vers les horaires de l'annee en cours.
 *
 * Les horaires et les recreations vivent sur la fiche de l'ANNEE, parce qu'ils
 * en dependent. Mais personne ne va les chercher la : on cherche « horaires »
 * dans les parametres. Cette page y mene, sans demander de savoir quelle annee
 * est active ni ou cliquer.
 */
export default async function HoursShortcutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'schedule.manage_configuration');

  const year = ctx.academicYear?.id ?? null;
  redirect(year ? `/e/${slug}/academic-years/${year}?onglet=horaires` : `/e/${slug}/academic-years`);
}
