import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getClass } from '@/features/classes/queries';
import { listLevels } from '@/features/structure/queries';
import { listActiveTeachers } from '@/features/teachers/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { ClassForm } from '@/features/classes/components/ClassForm';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { updateClassAction, deleteClassAction } from '@/features/classes/actions';

export const metadata: Metadata = { title: 'Modifier la classe' };

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'classes.update');

  const [klass, levels, teachers] = await Promise.all([
    getClass(ctx, id),
    listLevels(ctx),
    listActiveTeachers(ctx),
  ]);
  if (!klass) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={klass.name}
        description={`Code ${klass.code}`}
        action={
          <Link href={`/e/${slug}/classes`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      <ClassForm
        action={updateClassAction.bind(null, slug, id)}
        levels={levels.map((l) => ({ id: l.id, name: l.name }))}
        teachers={teachers}
        submitLabel="Enregistrer"
        defaultValues={{
          levelId: klass.level_id,
          code: klass.code,
          name: klass.name,
          capacity: String(klass.capacity),
          headTeacherId: klass.head_teacher_id ?? '',
        }}
      />

      {hasPermission(ctx, 'classes.delete') ? (
        <div className="rounded-[--radius-card] border border-dashed p-4">
          <p className="mb-2 text-sm font-medium">Supprimer cette classe</p>
          <ConfirmSubmit
            action={deleteClassAction.bind(null, slug, id)}
            label="Supprimer"
            confirmMessage={`Supprimer la classe « ${klass.name} » ?`}
          />
        </div>
      ) : null}
    </div>
  );
}
