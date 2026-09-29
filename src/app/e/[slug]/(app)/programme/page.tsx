import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { ProgrammePanel } from '@/features/programme/panel';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Programme par niveau' };

/**
 * Programme d'un niveau (espace Enseignant, et lien direct). La direction le
 * retrouve dans Matières, onglet « Programme et coefficients » : même écran,
 * même composant.
 */
export default async function ProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'subjects.view');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title="Programme par niveau"
        description="Matières, coefficients et volumes horaires du niveau choisi. Les coefficients pondèrent les moyennes générales."
      action={<BackToSettings ctx={ctx} />}
      />
      <ProgrammePanel ctx={ctx} slug={slug} sp={sp} basePath={`/e/${slug}/programme`} />
    </div>
  );
}
