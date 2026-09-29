import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getSubject } from '@/features/subjects/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { schoolTracks } from '@/features/structure/queries';
import { SubjectForm } from '@/features/subjects/components/SubjectForm';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { updateSubjectAction, deleteSubjectAction } from '@/features/subjects/actions';

export const metadata: Metadata = { title: 'Modifier la matière' };

export default async function EditSubjectPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'subjects.update');

  const subject = await getSubject(ctx, id);
  if (!subject) notFound();

  const tracks = await schoolTracks(ctx);
  const action = updateSubjectAction.bind(null, slug, id);
  const del = deleteSubjectAction.bind(null, slug, id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={subject.name}
        description={`Code ${subject.code}`}
        action={
          <Link href={`/e/${slug}/subjects`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      <SubjectForm
        action={action}
        submitLabel="Enregistrer"
        defaultActive={subject.is_active}
        schoolTracks={tracks}
        defaultTracks={subject.tracks as string[]}
        defaultValues={{
          code: subject.code,
          name: subject.name,
          shortName: subject.short_name ?? '',
          category: subject.category ?? '',
          color: subject.color ?? '',
          defaultCoefficient: String(subject.default_coefficient),
        }}
      />

      {hasPermission(ctx, 'subjects.delete') ? (
        <div className="rounded-[--radius-card] border border-dashed p-4">
          <p className="mb-2 text-sm font-medium">Supprimer cette matière</p>
          <p className="mb-3 text-sm text-[color:var(--muted-foreground)]">
            Action definitive. Impossible si la matière est déjà utilisée (programme, affectation,
            évaluation) ; dans ce cas, desactivez-la plutôt.
          </p>
          <ConfirmSubmit
            action={del}
            label="Supprimer"
            confirmMessage={`Supprimer definitivement la matière « ${subject.name} » ?`}
          />
        </div>
      ) : null}
    </div>
  );
}
