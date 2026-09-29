import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { PageHeader } from '@/components/layout/PageHeader';
import { SubjectForm } from '@/features/subjects/components/SubjectForm';
import { createSubjectAction } from '@/features/subjects/actions';
import { schoolTracks } from '@/features/structure/queries';

export const metadata: Metadata = { title: 'Nouvelle matière' };

export default async function NewSubjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'subjects.create');

  const action = createSubjectAction.bind(null, slug);
  const tracks = await schoolTracks(ctx);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nouvelle matière"
        action={
          <Link href={`/e/${slug}/subjects`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      <SubjectForm action={action} submitLabel="Créer la matière" schoolTracks={tracks} />
    </div>
  );
}
