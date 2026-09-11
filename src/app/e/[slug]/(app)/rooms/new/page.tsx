import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listRoomTypes } from '@/features/rooms/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { RoomForm } from '@/features/rooms/components/RoomForm';
import { createRoomAction } from '@/features/rooms/actions';

export const metadata: Metadata = { title: 'Nouvelle salle' };

export default async function NewRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'rooms.create');
  const roomTypes = await listRoomTypes(ctx);

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
      <RoomForm action={createRoomAction.bind(null, slug)} roomTypes={roomTypes} submitLabel="Creer la salle" />
    </div>
  );
}
