import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listLevels, schoolTracks } from '@/features/structure/queries';
import { listActiveTeachers } from '@/features/teachers/queries';
import { listActiveRoomOptions } from '@/features/rooms/queries';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { ClassCreateForm } from '@/features/classes/components/ClassCreateForm';
import { createClassesAction } from '@/features/classes/actions';

export const metadata: Metadata = { title: 'Nouvelle classe' };

export default async function NewClassPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'classes.create');

  const [levels, teachers, rooms, tracks] = await Promise.all([listLevels(ctx), listActiveTeachers(ctx), listActiveRoomOptions(ctx), schoolTracks(ctx)]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nouvelle classe"
        description="Une classe, ou toute une série d’un coup."
        action={
          <Link href={`/e/${slug}/classes`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      {levels.length === 0 ? (
        <EmptyState
          title="Aucun niveau défini"
          hint="Créez d'abord les niveaux, ou chargez la grille officielle (6ème à Terminale) depuis Programme."
          action={{ href: `/e/${slug}/programme`, label: 'Ouvrir le programme' }}
        />
      ) : (
        <ClassCreateForm
          action={createClassesAction.bind(null, slug)}
          levels={levels.map((l) => ({
            id: l.id,
            code: l.code,
            name: l.name,
            track: l.track ?? 'GENERAL',
            diploma: l.diploma ?? null,
          }))}
          teachers={teachers}
          rooms={rooms}
          schoolTracks={tracks}
        />
      )}
    </div>
  );
}
