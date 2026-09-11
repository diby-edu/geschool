import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listRoomTypes } from '@/features/rooms/queries';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { RoomTypeCreateForm } from '@/features/rooms/components/RoomTypeCreateForm';
import { createRoomTypeAction, deleteRoomTypeAction } from '@/features/rooms/actions';

export const metadata: Metadata = { title: 'Types de salle' };

export default async function RoomTypesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'rooms.view');
  const types = await listRoomTypes(ctx);
  const canManage = hasPermission(ctx, 'rooms.create');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title="Types de salle"
        description="Laboratoire, gymnase, salle informatique… Utilises comme contrainte de l'emploi du temps."
        action={
          <Link href={`/e/${slug}/rooms`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour aux salles
          </Link>
        }
      />

      {types.length === 0 ? (
        <EmptyState title="Aucun type de salle" hint="Ajoutez-en un ci-dessous si vos salles ont des contraintes." />
      ) : (
        <ul className="space-y-2">
          {types.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <span className="font-medium">{t.name}</span>{' '}
                    <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{t.code}</span>
                  </div>
                  {canManage ? (
                    <ConfirmSubmit
                      action={deleteRoomTypeAction.bind(null, slug, t.id)}
                      label="Supprimer"
                      variant="secondary"
                      confirmMessage={`Supprimer le type « ${t.name} » ?`}
                    />
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {canManage ? <RoomTypeCreateForm action={createRoomTypeAction.bind(null, slug)} /> : null}
    </div>
  );
}
