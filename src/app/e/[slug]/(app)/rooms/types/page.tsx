import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listRoomTypes, listRoomFeatures } from '@/features/rooms/queries';
import { schoolTracks } from '@/features/structure/queries';
import { RoomTypeTracks } from '@/features/rooms/components/RoomTypeTracks';
import { RoomTabs } from '@/features/rooms/components/RoomTabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { NamedListForm } from '@/components/forms/NamedListForm';
import { ROOM_TYPE_SUGGESTIONS, ROOM_FEATURE_SUGGESTIONS } from '@/features/rooms/suggestions';
import { TRACK_LABELS } from '@/features/structure/official-tracks';
import {
  createRoomTypeAction,
  updateRoomTypeTracksAction,
  deleteRoomTypeAction,
  createRoomFeatureAction,
  deleteRoomFeatureAction,
} from '@/features/rooms/actions';

export const metadata: Metadata = { title: 'Types de salle et équipements' };

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
  requireFeature(ctx, 'rooms');
  const [types, features, tracks] = await Promise.all([listRoomTypes(ctx), listRoomFeatures(ctx), schoolTracks(ctx)]);
  const canManage = hasPermission(ctx, 'rooms.create');
  const canEdit = hasPermission(ctx, 'rooms.update');
  // On ne propose jamais un type d'un ordre que l'etablissement n'a pas.
  // `values` : cliquer une suggestion pre-coche les ordres qui lui correspondent.
  const typeSuggestions = ROOM_TYPE_SUGGESTIONS.filter((s) => s.tracks.some((t) => tracks.includes(t))).map((s) => ({
    code: s.code,
    name: s.name,
    values: s.tracks.filter((t) => tracks.includes(t)),
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title="Types de salle et équipements"
        description="Ce que vos salles sont (laboratoire, atelier, cuisine) et ce qu’elles contiennent (paillasses, postes, machines). Les deux servent de contrainte à l’emploi du temps."
        action={
          <Link href={`/e/${slug}/rooms`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour aux salles
          </Link>
        }
      />

      <RoomTabs base={`/e/${slug}/rooms`} current="types" />

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Types de salle
        </h2>
        {types.length === 0 ? (
          <EmptyState title="Aucun type de salle" hint="Ajoutez-en un ci-dessous, ou partez d’une suggestion." />
        ) : (
          <ul className="space-y-2">
            {types.map((t) => (
              <li key={t.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p>
                        <span className="font-medium">{t.name}</span>{' '}
                        <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{t.code}</span>
                      </p>
                      <RoomTypeTracks
                        action={updateRoomTypeTracksAction.bind(null, slug, t.id)}
                        current={t.tracks}
                        schoolTracks={tracks}
                        readOnly={!canEdit}
                      />
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
        {canManage ? (
          <NamedListForm
            action={createRoomTypeAction.bind(null, slug)}
            title="Ajouter un type de salle"
            placeholder="Atelier froid et climatisation"
            suggestions={typeSuggestions}
            existing={types.map((t) => t.name)}
            {...(tracks.length > 1
              ? {
                  checkboxes: {
                    name: 'tracks',
                    legend: 'Ordres d’enseignement',
                    hint: 'Où ce type a un sens. Repris de la suggestion choisie.',
                    options: tracks.map((t) => ({ value: t as string, label: TRACK_LABELS[t] })),
                    selected: tracks as string[],
                  },
                }
              : {})}
          />
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          Équipements
        </h2>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Plus précis que le type : un cours peut exiger « des paillasses » ou « vingt postes informatiques » sans
          imposer une salle en particulier.
        </p>
        {features.length === 0 ? (
          <EmptyState title="Aucun équipement" hint="Facultatif : utile si certains cours ont besoin de matériel." />
        ) : (
          <ul className="space-y-2">
            {features.map((f) => (
              <li key={f.id}>
                <Card>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium">{f.name}</span>{' '}
                      <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{f.code}</span>
                    </div>
                    {canManage ? (
                      <ConfirmSubmit
                        action={deleteRoomFeatureAction.bind(null, slug, f.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer l'équipement « ${f.name} » ?`}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <NamedListForm
            action={createRoomFeatureAction.bind(null, slug)}
            title="Ajouter un équipement"
            placeholder="Machines-outils"
            suggestions={ROOM_FEATURE_SUGGESTIONS}
            existing={features.map((f) => f.name)}
          />
        ) : null}
      </section>

    </div>
  );
}
