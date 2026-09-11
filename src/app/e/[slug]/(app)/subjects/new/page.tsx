import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { PageHeader } from '@/components/layout/PageHeader';
import { SubjectForm } from '@/features/subjects/components/SubjectForm';
import { createSubjectAction } from '@/features/subjects/actions';

export const metadata: Metadata = { title: 'Nouvelle matiere' };

export default async function NewSubjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'subjects.create');

  const action = createSubjectAction.bind(null, slug);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nouvelle matiere"
        action={
          <Link href={`/e/${slug}/subjects`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      <SubjectForm action={action} submitLabel="Creer la matiere" />
    </div>
  );
}
