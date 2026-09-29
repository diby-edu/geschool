import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getRoom, listRoomTypes, listRoomFeatures, listRoomFeatureIds } from '@/features/rooms/queries';
import { roomWeek, DAY_NAMES } from '@/features/rooms/occupancy';
import { listClosures, affectedSessions } from '@/features/rooms/closures';
import { listRoomRules } from '@/features/rooms/weekly-availability';
import { WeeklyRuleForm, WeeklyRuleList } from '@/features/rooms/components/WeeklyRulePanel';
import { listActiveRoomOptions } from '@/features/rooms/queries';
import { schoolTracks } from '@/features/structure/queries';
import { ClosureCard, ClosureCreateForm } from '@/features/rooms/components/ClosurePanel';
import {
  createClosureAction,
  deleteClosureAction,
  moveOccurrenceRoomAction,
  createRoomRuleAction,
  deleteRoomRuleAction,
} from '@/features/rooms/assignment-actions';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { RoomForm } from '@/features/rooms/components/RoomForm';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { updateRoomAction, deleteRoomAction } from '@/features/rooms/actions';

export const metadata: Metadata = { title: 'Modifier la salle' };

export default async function EditRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'rooms.update');
  requireFeature(ctx, 'rooms');

  const [room, roomTypes, week, features, selectedFeatures, tracks] = await Promise.all([
    getRoom(ctx, id),
    listRoomTypes(ctx),
    roomWeek(ctx, id),
    listRoomFeatures(ctx),
    listRoomFeatureIds(ctx, id),
    schoolTracks(ctx),
  ]);
  if (!room) notFound();

  const canManage = hasPermission(ctx, 'rooms.update');

  // Fermetures de la salle, et les séances qu'elles touchent.
  const [closures, weeklyRules] = await Promise.all([listClosures(ctx, id), listRoomRules(ctx, id)]);
  const closureSessions = await Promise.all(
    closures.map((c) => affectedSessions(ctx, id, c.startsOn, c.endsOn)),
  );
  const otherRooms = (await listActiveRoomOptions(ctx)).filter((r) => r.id !== id);

  // Ce qui se passe dans cette salle, d'après l'emploi du temps publié.
  const days = [1, 2, 3, 4, 5, 6]
    .map((d) => ({ day: d, slots: week.filter((w) => w.dayOfWeek === d) }))
    .filter((d) => d.slots.length > 0);

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

      {typeof sp.fermee === 'string' ? (
        <Alert tone="success">
          Fermeture enregistrée.{' '}
          {sp.touchees && sp.touchees !== '0'
            ? `${sp.touchees} séance(s) étaient prévues ici : déplacez-les ci-dessous.`
            : 'Aucun cours n’était prévu sur ces dates.'}
        </Alert>
      ) : null}
      {typeof sp.rouverte === 'string' ? <Alert tone="success">Fermeture levée.</Alert> : null}
      {typeof sp.deplacee === 'string' ? <Alert tone="success">Séance déplacée dans sa nouvelle salle.</Alert> : null}

      {typeof sp.regle === 'string' ? <Alert tone="success">Indisponibilité hebdomadaire enregistrée.</Alert> : null}
      {typeof sp.regle_levee === 'string' ? <Alert tone="success">Indisponibilité retirée.</Alert> : null}

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Indisponibilités hebdomadaires
        </h2>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Ce qui revient chaque semaine : salle prêtée, club, réunion. L’emploi du temps n’y placera aucun cours et la
          salle ne sera pas proposée comme libre à ces heures-là.
        </p>
        <WeeklyRuleList
          rules={weeklyRules.map((r) => ({ ...r, deleteAction: deleteRoomRuleAction.bind(null, slug, id, r.id) }))}
          canEdit={canManage}
        />
        {canManage ? <WeeklyRuleForm action={createRoomRuleAction.bind(null, slug, id)} /> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Fermetures
        </h2>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Travaux, examens, salle prêtée : pendant une fermeture, la salle n’est plus proposée et les cours déjà prévus
          sont listés pour que vous les déplaciez.
        </p>
        {closures.length === 0 ? (
          <Card>
            <CardContent className="py-3 text-sm text-[color:var(--muted-foreground)]">
              Aucune fermeture enregistrée cette année.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {closures.map((c, i) => (
              <ClosureCard
                key={c.id}
                closure={c}
                sessions={closureSessions[i] ?? []}
                rooms={otherRooms}
                deleteAction={deleteClosureAction.bind(null, slug, id, c.id)}
                moveAction={(occurrenceId) => moveOccurrenceRoomAction.bind(null, slug, id, occurrenceId)}
                canEdit={canManage}
              />
            ))}
          </div>
        )}
        {canManage ? <ClosureCreateForm action={createClosureAction.bind(null, slug, id)} /> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Occupation de la semaine
        </h2>
        {days.length === 0 ? (
          <Card>
            <CardContent className="py-4 text-sm text-[color:var(--muted-foreground)]">
              Aucun cours n’est prévu dans cette salle. L’occupation vient de l’emploi du temps publié : s’il n’y en a
              pas encore, cette liste reste vide.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {days.map((d) => (
              <Card key={d.day}>
                <CardContent className="space-y-1.5 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    {DAY_NAMES[d.day - 1]} <span className="tabular-nums">({d.slots.length})</span>
                  </p>
                  <ul className="space-y-1 text-sm">
                    {d.slots.map((sl) => (
                      <li key={sl.sessionId} className="flex justify-between gap-3">
                        <span className="font-mono text-xs tabular-nums text-[color:var(--muted-foreground)]">
                          {sl.startsAt}–{sl.endsAt}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {sl.subject}
                          {sl.classes.length > 0 ? ` · ${sl.classes.join(', ')}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <RoomForm
        action={updateRoomAction.bind(null, slug, id)}
        roomTypes={roomTypes}
        submitLabel="Enregistrer"
        features={features}
        selectedFeatures={selectedFeatures}
        defaultActive={room.is_active}
        schoolTracks={tracks}
        defaultTracks={room.tracks}
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
