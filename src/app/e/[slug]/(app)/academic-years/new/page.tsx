import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { PageHeader } from '@/components/layout/PageHeader';
import { YearPicker } from '@/features/academic-years/components/YearPicker';
import { createYearAction } from '@/features/academic-years/actions';
import { suggestedYears } from '@/features/academic-years/school-year';
import { listYears } from '@/features/academic-years/queries';

export const metadata: Metadata = { title: 'Nouvelle année scolaire' };

export default async function NewYearPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'academic_years.manage');
  const existantes = (await listYears(ctx)).map((y) => y.name);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nouvelle année scolaire"
        description="Choisissez l’année : ses dates sont déjà remplies, son nom se déduit de la rentrée." 
        action={
          <Link href={`/e/${slug}/academic-years`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      <YearPicker action={createYearAction.bind(null, slug)} suggestions={suggestedYears()} existing={existantes} />
    </div>
  );
}
