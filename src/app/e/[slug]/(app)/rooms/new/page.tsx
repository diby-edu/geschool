import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { listRoomTypes, listRoomFeatures } from '@/features/rooms/queries';
import { schoolTracks } from '@/features/structure/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { RoomCreateForm } from '@/features/rooms/components/RoomCreateForm';
import { createRoomsAction } from '@/features/rooms/actions';

export const metadata: Metadata = { title: 'Nouvelle salle' };

export default async function NewRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'rooms.create');
  requireFeature(ctx, 'rooms');
  const [roomTypes, features, tracks] = await Promise.all([listRoomTypes(ctx), listRoomFeatures(ctx), schoolTracks(ctx)]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nouvelle salle"
        action={
          <Link href={`/e/${slug}/rooms`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      <RoomCreateForm
        action={createRoomsAction.bind(null, slug)}
        roomTypes={roomTypes}
        features={features}
        schoolTracks={tracks}
      />
    </div>
  );
}
