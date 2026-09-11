import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { PageHeader } from '@/components/layout/PageHeader';
import { YearForm } from '@/features/academic-years/components/YearForm';
import { createYearAction } from '@/features/academic-years/actions';

export const metadata: Metadata = { title: 'Nouvelle annee scolaire' };

export default async function NewYearPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'academic_years.manage');

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Nouvelle annee scolaire"
        action={
          <Link href={`/e/${slug}/academic-years`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      <YearForm action={createYearAction.bind(null, slug)} submitLabel="Creer l'annee" />
    </div>
  );
}
