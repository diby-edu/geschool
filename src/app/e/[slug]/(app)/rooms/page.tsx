import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { parseListParams } from '@/lib/query/list';
import { listRooms, ROOM_SORTABLE, type RoomRow } from '@/features/rooms/queries';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Salles' };

export default async function RoomsPage({
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

  const listParams = parseListParams(sp, { sortable: ROOM_SORTABLE, defaultSort: 'code' });
  const { rows, total } = await listRooms(ctx, listParams);
  const base = `/e/${slug}/rooms`;
  const canEdit = hasPermission(ctx, 'rooms.update');

  const columns: Column<RoomRow>[] = [
    { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="font-mono">{r.code}</span> },
    { key: 'name', header: 'Nom', sortable: true, render: (r) => r.name },
    { key: 'room_type', header: 'Type', render: (r) => r.room_type_name ?? '—' },
    { key: 'capacity', header: 'Capacite', sortable: true, align: 'right', render: (r) => r.capacity },
    {
      key: 'is_active',
      header: 'Statut',
      render: (r) =>
        r.is_active ? <span className="text-[color:var(--color-success)]">Active</span> : <span className="text-[color:var(--muted-foreground)]">Inactive</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <Flash searchParams={sp} />
      <PageHeader
        title="Salles"
        description="Les salles et espaces de l'etablissement."
        action={
          <div className="flex gap-2">
            <Link href={`${base}/types`}>
              <Button variant="secondary">Types de salle</Button>
            </Link>
            {hasPermission(ctx, 'rooms.create') ? (
              <Link href={`${base}/new`}>
                <Button>Nouvelle salle</Button>
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-4">
        <SearchBar
          basePath={base}
          defaultValue={listParams.q}
          placeholder="Rechercher par nom ou code…"
          hidden={listParams.sort ? { sort: listParams.sort, dir: listParams.dir } : {}}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        params={listParams}
        basePath={base}
        searchParams={sp}
        rowHref={canEdit ? (r) => `${base}/${r.id}` : undefined}
        emptyLabel="Aucune salle. Creez-en une pour commencer."
      />
    </div>
  );
}
