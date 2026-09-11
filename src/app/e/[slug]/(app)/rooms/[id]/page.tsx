import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getRoom, listRoomTypes } from '@/features/rooms/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { RoomForm } from '@/features/rooms/components/RoomForm';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { updateRoomAction, deleteRoomAction } from '@/features/rooms/actions';

export const metadata: Metadata = { title: 'Modifier la salle' };

export default async function EditRoomPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'rooms.update');

  const [room, roomTypes] = await Promise.all([getRoom(ctx, id), listRoomTypes(ctx)]);
  if (!room) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={room.name}
        description={`Code ${room.code}`}
        action={
          <Link href={`/e/${slug}/rooms`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      <RoomForm
        action={updateRoomAction.bind(null, slug, id)}
        roomTypes={roomTypes}
        submitLabel="Enregistrer"
        defaultActive={room.is_active}
        defaultAccessible={room.is_accessible}
        defaultValues={{
          code: room.code,
          name: room.name,
          roomTypeId: room.room_type_id ?? '',
          capacity: String(room.capacity),
          building: room.building ?? '',
          floor: room.floor ?? '',
        }}
      />

      {hasPermission(ctx, 'rooms.delete') ? (
        <div className="rounded-[--radius-card] border border-dashed p-4">
          <p className="mb-2 text-sm font-medium">Supprimer cette salle</p>
          <ConfirmSubmit
            action={deleteRoomAction.bind(null, slug, id)}
            label="Supprimer"
            confirmMessage={`Supprimer definitivement la salle « ${room.name} » ?`}
          />
        </div>
      ) : null}
    </div>
  );
}
