import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { parseListParams } from '@/lib/query/list';
import { listRooms, ROOM_SORTABLE, type RoomRow } from '@/features/rooms/queries';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { listAssignments, listRoomOptions, getRoomPolicy } from '@/features/rooms/assignments';
import { assignsRooms, ROOM_MODE_LABELS } from '@/features/rooms/policy';
import { AssignmentRowForm, RoomPolicyForm } from '@/features/rooms/components/AssignmentPanel';
import { assignRoomAction, updateRoomPolicyAction } from '@/features/rooms/assignment-actions';
import { TRACK_LABELS, type EducationTrack } from '@/features/structure/official-tracks';
import { roomsAt, DAY_NAMES } from '@/features/rooms/occupancy';
import { Card, CardContent } from '@/components/ui/card';
import { BackToSettings } from '@/features/settings/components/BackToSettings';
import { RoomTabs } from '@/features/rooms/components/RoomTabs';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { deleteRoomAction } from '@/features/rooms/actions';

const TABS = [
  { key: 'salles', label: 'Salles' },
  { key: 'affectation', label: 'Affectation aux classes' },
  { key: 'libres', label: 'Salles libres' },
] as const;

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
  requireFeature(ctx, 'rooms');

  const asked = typeof sp.onglet === 'string' ? sp.onglet : '';
  const tab = (TABS.find((t) => t.key === asked)?.key ?? 'salles') as (typeof TABS)[number]['key'];
  const base = `/e/${slug}/rooms`;
  const canEdit = hasPermission(ctx, 'rooms.update');
  const canDelete = hasPermission(ctx, 'rooms.delete');

  const listParams = parseListParams(sp, { sortable: ROOM_SORTABLE, defaultSort: 'code' });
  const { rows, total } = tab === 'salles' ? await listRooms(ctx, listParams) : { rows: [], total: 0 };

  // Onglet Affectation : le réglage de l'école, ses classes et ses salles.
  const [policy, assignments, roomOptions] =
    tab === 'affectation'
      ? await Promise.all([getRoomPolicy(ctx), listAssignments(ctx), listRoomOptions(ctx)])
      : [null, [], []];
  const canAssign = hasPermission(ctx, 'classes.update');

  // Onglet « Salles libres » : un jour, une heure, et l'état de chaque salle.
  const askedDay = Number(typeof sp.jour === 'string' ? sp.jour : '1');
  const day = Number.isInteger(askedDay) && askedDay >= 1 && askedDay <= 7 ? askedDay : 1;
  const hour = typeof sp.heure === 'string' && /^\d{2}:\d{2}$/.test(sp.heure) ? sp.heure : '08:00';
  const availability = tab === 'libres' ? await roomsAt(ctx, day, hour) : [];
  const freeRooms = availability.filter((r) => r.busyWith === null);
  const busyRooms = availability.filter((r) => r.busyWith !== null);
  // Les classes se lisent par ordre d'enseignement, comme partout ailleurs.
  const trackOrder: EducationTrack[] = ['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'];
  const assignmentGroups = trackOrder
    .map((track) => ({ track, rows: assignments.filter((a) => a.track === track) }))
    .filter((g) => g.rows.length > 0);

  const columns: Column<RoomRow>[] = [
    { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="font-mono">{r.code}</span> },
    { key: 'name', header: 'Nom', sortable: true, render: (r) => r.name },
    { key: 'room_type', header: 'Type', render: (r) => r.room_type_name ?? '—' },
    { key: 'capacity', header: 'Capacité', sortable: true, align: 'right', render: (r) => r.capacity },
    {
      key: 'is_active',
      header: 'Statut',
      render: (r) =>
        r.is_active ? <span className="text-[color:var(--color-success)]">Active</span> : <span className="text-[color:var(--muted-foreground)]">Inactive</span>,
    },
  ];

  // Modifier et supprimer depuis la liste : ouvrir la fiche pour supprimer une
  // salle faisait trois clics, et rien ne disait que la fiche servait à ça.
  if (canEdit || canDelete) {
    columns.push({
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          {canEdit ? (
            <Link href={`${base}/${r.id}`}>
              <Button variant="secondary" size="sm">
                Modifier
              </Button>
            </Link>
          ) : null}
          {canDelete ? (
            <ConfirmSubmit
              action={deleteRoomAction.bind(null, slug, r.id)}
              label="Supprimer"
              confirmMessage={`Supprimer définitivement la salle « ${r.name} » ? Les classes qui l’ont comme salle attitrée n’en auront plus.`}
            />
          ) : null}
        </div>
      ),
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Flash searchParams={sp} />
      {typeof sp.creees === 'string' ? (
        <Alert tone="success">
          {sp.creees} salle{Number(sp.creees) > 1 ? 's créées' : ' créée'}. Affectez-les aux classes depuis l’onglet
          « Affectation aux classes ».
        </Alert>
      ) : null}
      <PageHeader
        title="Salles"
        description="Les salles et espaces de l'établissement."
        action={
          <div className="flex items-center gap-3">
            <BackToSettings ctx={ctx} />
            {<div className="flex gap-2">
            <Link href={`/e/${slug}/import?type=rooms`}>
              <Button variant="secondary">Importer / exporter</Button>
            </Link>
            {hasPermission(ctx, 'rooms.create') ? (
              <Link href={`${base}/new`}>
                <Button>Nouvelle salle</Button>
              </Link>
            ) : null}
            </div>}
          </div>
        }
      />

      <RoomTabs base={base} current={tab} />

      {tab === 'affectation' && policy ? (
        <div className="space-y-4">
          {typeof sp.regle === 'string' ? <Alert tone="success">Réglage enregistré.</Alert> : null}
          {typeof sp.affectee === 'string' ? <Alert tone="success">Salle affectée.</Alert> : null}
          {typeof sp.avertissement === 'string' ? <Alert tone="info">{sp.avertissement}</Alert> : null}
          {typeof sp.deplaces === 'string' || typeof sp.laisses === 'string' ? (
            <Alert tone="success">
              Salle affectée.{' '}
              {typeof sp.deplaces === 'string' ? `${sp.deplaces} cours à venir déplacé(s) dans cette salle.` : ''}{' '}
              {typeof sp.laisses === 'string'
                ? `${sp.laisses} cours laissé(s) où ils étaient : la salle y est déjà occupée.`
                : ''}
            </Alert>
          ) : null}

          {canEdit ? <RoomPolicyForm action={updateRoomPolicyAction.bind(null, slug)} policy={policy} /> : null}

          {!assignsRooms(policy) ? (
            <Alert tone="info">
              Votre école est réglée sur « {ROOM_MODE_LABELS.ROTATION.title} » : les classes n’ont pas de salle attitrée,
              la salle se choisit cours par cours dans l’emploi du temps. Changez le réglage ci-dessus pour affecter des
              salles.
            </Alert>
          ) : assignments.length === 0 ? (
            <Alert tone="info">Aucune classe active cette année : créez vos classes d’abord.</Alert>
          ) : (
            assignmentGroups.map((g) => (
              <section key={g.track} className="space-y-2">
                {assignmentGroups.length > 1 ? (
                  <h2 className="pt-1 text-xs font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    {TRACK_LABELS[g.track]}
                  </h2>
                ) : null}
                {g.rows.map((row) => (
                  <AssignmentRowForm
                    key={row.classId}
                    action={assignRoomAction.bind(null, slug, row.classId)}
                    row={row}
                    rooms={roomOptions}
                    canEdit={canAssign}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      ) : null}

      {tab === 'libres' ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="py-4">
              <form method="get" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="onglet" value="libres" />
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Jour</span>
                  <select
                    name="jour"
                    defaultValue={String(day)}
                    className="h-10 cursor-pointer rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm"
                  >
                    {[1, 2, 3, 4, 5, 6].map((d) => (
                      <option key={d} value={d}>
                        {DAY_NAMES[d - 1]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Heure</span>
                  <input
                    type="time"
                    name="heure"
                    defaultValue={hour}
                    className="h-10 rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm"
                  />
                </label>
                <Button type="submit" variant="secondary">
                  Voir
                </Button>
              </form>
              <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
                D’après l’emploi du temps publié. Une salle sans cours à cette heure est comptée libre.
              </p>
            </CardContent>
          </Card>

          {availability.length === 0 ? (
            <Alert tone="info">Aucune salle active : créez-en d’abord.</Alert>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-success)' }}>
                  Libres <span className="tabular-nums">({freeRooms.length})</span>
                </h2>
                {freeRooms.length === 0 ? (
                  <p className="text-sm text-[color:var(--muted-foreground)]">Aucune salle libre à cette heure.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {freeRooms.map((r) => (
                      <li key={r.id}>
                        <Card>
                          <CardContent className="flex items-center justify-between py-2.5 text-sm">
                            <span className="font-medium">{r.name}</span>
                            <span className="text-xs text-[color:var(--muted-foreground)]">{r.capacity} places</span>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  Occupées <span className="tabular-nums">({busyRooms.length})</span>
                </h2>
                <ul className="space-y-1.5">
                  {busyRooms.map((r) => (
                    <li key={r.id}>
                      <Card>
                        <CardContent className="py-2.5 text-sm">
                          <span className="font-medium">{r.name}</span>
                          <br />
                          <span className="text-xs text-[color:var(--muted-foreground)]">{r.busyWith}</span>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'salles' ? (
      <>
      <div className="mb-4">
        <SearchBar
          basePath={base}
          defaultValue={listParams.q}
          placeholder="Rechercher par nom ou code…"
          hidden={{ onglet: 'salles', ...(listParams.sort ? { sort: listParams.sort, dir: listParams.dir } : {}) }}
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
      </>
      ) : null}
    </div>
  );
}
