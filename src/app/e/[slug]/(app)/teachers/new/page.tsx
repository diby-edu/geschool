import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { PageHeader } from '@/components/layout/PageHeader';
import { TeacherForm } from '@/features/teachers/components/TeacherForm';
import { createTeacherAction } from '@/features/teachers/actions';

export const metadata: Metadata = { title: 'Nouvel enseignant' };

export default async function NewTeacherPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'teachers.create');

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nouvel enseignant"
        action={
          <Link href={`/e/${slug}/teachers`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      <TeacherForm action={createTeacherAction.bind(null, slug)} submitLabel="Creer l'enseignant" />
    </div>
  );
}
