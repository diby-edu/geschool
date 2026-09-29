import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getClass } from '@/features/classes/queries';
import { listLevels, schoolTracks } from '@/features/structure/queries';
import { TRACK_LABELS } from '@/features/structure/official-tracks';
import { listActiveTeachers } from '@/features/teachers/queries';
import { listActiveRoomOptions } from '@/features/rooms/queries';
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

  const [klass, levels, teachers, tracks] = await Promise.all([
    getClass(ctx, id),
    listLevels(ctx),
    listActiveTeachers(ctx),
    schoolTracks(ctx),
  ]);
  if (!klass) notFound();

  // Salle attitrée : on ne propose que les salles qui servent l'ordre de la
  // classe. Un atelier réservé au professionnel n'a rien à faire dans la liste
  // d'une 6ème générale.
  const classTrack = levels.find((l) => l.id === klass.level_id)?.track ?? undefined;
  const rooms = await listActiveRoomOptions(ctx, tracks.length > 1 ? classTrack : undefined);

  // Avec plusieurs ordres d'enseignement, « 2nde A » (général) et « 2nde AB »
  // (technique) se ressemblent : le niveau dit à quel ordre il appartient.
  const levelOptions = levels.map((l) => ({
    id: l.id,
    name: tracks.length > 1 && l.track && l.track !== 'GENERAL' ? `${l.name} · ${TRACK_LABELS[l.track].replace('Enseignement ', '').replace('Formation ', '')}` : l.name,
  }));

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
        levels={levelOptions}
        teachers={teachers}
        rooms={rooms}
        submitLabel="Enregistrer"
        defaultValues={{
          levelId: klass.level_id,
          code: klass.code,
          name: klass.name,
          capacity: String(klass.capacity),
          headTeacherId: klass.head_teacher_id ?? '',
          mainRoomId: klass.main_room_id ?? '',
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
