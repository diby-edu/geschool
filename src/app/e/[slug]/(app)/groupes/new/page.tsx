import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listYearClasses, listActiveSubjects } from '@/features/assignments/queries';
import { createGroupAction } from '@/features/groups/actions';
import { GroupForm } from '@/features/groups/components/GroupForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';

export const metadata: Metadata = { title: 'Nouveau groupe' };

export default async function NewGroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'groups.create');

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Nouveau groupe" />
        <EmptyState title="Aucune année active" hint="Activez une année scolaire d'abord." />
      </div>
    );
  }

  const [classes, subjects] = await Promise.all([
    listYearClasses(ctx, ctx.academicYear.id),
    listActiveSubjects(ctx),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Nouveau groupe"
        description="Des élèves venus d’une ou plusieurs classes, pour un enseignement que toute la classe ne suit pas."
        action={
          <Link href={`/e/${slug}/groupes`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      {classes.length === 0 ? (
        <EmptyState
          title="Aucune classe"
          hint="Créez d’abord des classes : un groupe tire ses élèves des classes."
          action={{ href: `/e/${slug}/classes`, label: 'Gérer les classes' }}
        />
      ) : (
        <GroupForm
          action={createGroupAction.bind(null, slug)}
          classes={classes}
          subjects={subjects}
          submitLabel="Créer le groupe"
        />
      )}
    </div>
  );
}
