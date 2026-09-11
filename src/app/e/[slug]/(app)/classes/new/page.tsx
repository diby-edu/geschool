import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listLevels } from '@/features/structure/queries';
import { listActiveTeachers } from '@/features/teachers/queries';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { ClassForm } from '@/features/classes/components/ClassForm';
import { createClassAction } from '@/features/classes/actions';

export const metadata: Metadata = { title: 'Nouvelle classe' };

export default async function NewClassPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'classes.create');

  const [levels, teachers] = await Promise.all([listLevels(ctx), listActiveTeachers(ctx)]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nouvelle classe"
        action={
          <Link href={`/e/${slug}/classes`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      {levels.length === 0 ? (
        <EmptyState
          title="Aucun niveau defini"
          hint="Creez d'abord des cycles et des niveaux dans la structure pedagogique."
        />
      ) : (
        <ClassForm
          action={createClassAction.bind(null, slug)}
          levels={levels.map((l) => ({ id: l.id, name: l.name }))}
          teachers={teachers}
          submitLabel="Creer la classe"
        />
      )}
    </div>
  );
}
