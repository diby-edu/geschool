import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { parseListParams } from '@/lib/query/list';
import { listClassBoard, type ClassBoardRow } from '@/features/classes/queries';
import { schoolTracks } from '@/features/structure/queries';
import { TRACK_LABELS, type EducationTrack } from '@/features/structure/official-tracks';
import { bulkClassesAction, deleteClassAction, setClassStatusAction } from '@/features/classes/actions';
import { ClassFilters } from '@/features/classes/components/ClassFilters';
import { BulkForm } from '@/features/classes/components/BulkBar';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Classes' };

const SORTABLE = ['code', 'name', 'level', 'track', 'enrolled', 'capacity'] as const;

/**
 * Les classes de l'année, en liste.
 *
 * Une école de quinze sixièmes ne se lit pas en mosaïque : on veut comparer les
 * effectifs, repérer les classes sans professeur principal, trier par niveau.
 * D'où un tableau trié par colonne, avec les filtres qui comptent — l'ordre
 * d'enseignement et le niveau — et une corbeille pour ce qui est archivé.
 */
export default async function ClassesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'classes.view');

  const base = `/e/${slug}/classes`;

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Classes" action={<BackToSettings ctx={ctx} />} />
        <EmptyState
          title="Aucune année scolaire active"
          hint="Activez une année scolaire pour gérer les classes."
          action={{ href: `/e/${slug}/academic-years`, label: 'Gérer les années scolaires' }}
        />
      </div>
    );
  }

  const listParams = parseListParams(sp, { sortable: SORTABLE, defaultSort: 'code' });
  const archived = sp.corbeille === '1';
  const track = typeof sp.ordre === 'string' ? sp.ordre : '';
  const levelId = typeof sp.niveau === 'string' ? sp.niveau : '';

  const [board, tracks] = await Promise.all([
    listClassBoard(ctx, ctx.academicYear.id, {
      status: archived ? 'ARCHIVED' : 'ACTIVE',
      ...(track ? { track } : {}),
      ...(levelId ? { levelId } : {}),
      ...(listParams.q ? { q: listParams.q } : {}),
      ...(listParams.sort ? { sort: listParams.sort } : {}),
      ...(listParams.dir ? { dir: listParams.dir } : {}),
    }),
    schoolTracks(ctx),
  ]);

  const canCreate = hasPermission(ctx, 'classes.create');
  const canUpdate = hasPermission(ctx, 'classes.update');
  const canDelete = hasPermission(ctx, 'classes.delete');
  const multiTrack = tracks.length > 1;

  // La pagination du tableau standard travaille sur la page demandée.
  const rows = board.rows.slice(listParams.from, listParams.to + 1);

  const keep = {
    ...(archived ? { corbeille: '1' } : {}),
    ...(track ? { ordre: track } : {}),
    ...(levelId ? { niveau: levelId } : {}),
  };

  const columns: Column<ClassBoardRow>[] = [
    ...(canDelete
      ? [
          {
            key: 'select',
            header: '',
            className: 'w-10',
            render: (c: ClassBoardRow) => (
              <input type="checkbox" name="ids" value={c.id} className="size-4" aria-label={`Sélectionner ${c.name}`} />
            ),
          } satisfies Column<ClassBoardRow>,
        ]
      : []),
    {
      key: 'code',
      header: 'Classe',
      sortable: true,
      render: (c) => (
        <span>
          {canUpdate && !archived ? (
            <Link href={`${base}/${c.id}`} className="font-semibold hover:underline">
              {c.name}
            </Link>
          ) : (
            <span className="font-semibold">{c.name}</span>
          )}
          <br />
          <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{c.code}</span>
        </span>
      ),
    },
    {
      key: 'level',
      header: 'Niveau',
      sortable: true,
      render: (c) => (
        <span>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
            {c.levelCode}
          </span>{' '}
          <span className="text-[color:var(--muted-foreground)]">{c.levelName}</span>
        </span>
      ),
    },
    ...(multiTrack
      ? [
          {
            key: 'track',
            header: 'Ordre',
            sortable: true,
            render: (c: ClassBoardRow) => (
              <span className="text-xs">
                {TRACK_LABELS[c.track as EducationTrack]?.replace('Enseignement ', '').replace('Formation ', '') ?? c.track}
              </span>
            ),
          } satisfies Column<ClassBoardRow>,
        ]
      : []),
    {
      key: 'head',
      header: 'Professeur principal',
      render: (c) =>
        c.headTeacher ?? <span className="text-[color:var(--muted-foreground)]">Non assigné</span>,
    },
    {
      key: 'enrolled',
      header: 'Effectif',
      sortable: true,
      align: 'right',
      render: (c) => (
        <span className="tabular-nums">
          {c.enrolled}
          <span className="text-[color:var(--muted-foreground)]"> / {c.capacity}</span>
        </span>
      ),
    },
    {
      key: 'capacity',
      header: 'Remplissage',
      sortable: true,
      align: 'right',
      render: (c) => {
        const pct = c.capacity > 0 ? Math.round((c.enrolled / c.capacity) * 100) : 0;
        const over = c.capacity > 0 && c.enrolled > c.capacity;
        return (
          <span className="tabular-nums" style={over ? { color: 'var(--color-danger)' } : undefined}>
            {c.capacity > 0 ? `${pct} %` : '—'}
          </span>
        );
      },
    },
    ...(canUpdate || canDelete
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (c: ClassBoardRow) => (
              <span className="flex justify-end gap-2">
                {archived ? (
                  canUpdate ? (
                    <ConfirmSubmit
                      action={setClassStatusAction.bind(null, slug, c.id, 'ACTIVE')}
                      label="Rétablir"
                      variant="secondary"
                      confirmMessage={`Rétablir la classe « ${c.name} » ?`}
                    />
                  ) : null
                ) : canDelete ? (
                  <ConfirmSubmit
                    action={setClassStatusAction.bind(null, slug, c.id, 'ARCHIVED')}
                    label="Archiver"
                    variant="secondary"
                    confirmMessage={`Archiver « ${c.name} » ? Elle quitte les listes, rien n'est perdu.`}
                  />
                ) : null}
                {archived && canDelete ? (
                  <ConfirmSubmit
                    action={deleteClassAction.bind(null, slug, c.id)}
                    label="Supprimer"
                    confirmMessage={`Supprimer définitivement « ${c.name} » ? Impossible si elle a des inscriptions.`}
                  />
                ) : null}
              </span>
            ),
          } satisfies Column<ClassBoardRow>,
        ]
      : []),
  ];

  const table = (
    <DataTable
      columns={columns}
      rows={rows}
      total={board.total}
      params={listParams}
      basePath={base}
      searchParams={sp}
      emptyLabel={archived ? 'Aucune classe archivée.' : 'Aucune classe. Créez-en une pour commencer.'}
    />
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Flash searchParams={sp} />
      {typeof sp.creees === 'string' ? (
        <Alert tone="success">
          {sp.creees} classe{Number(sp.creees) > 1 ? 's créées' : ' créée'}. Inscrivez maintenant les élèves, ou fixez le
          professeur principal depuis la fiche de chaque classe.
        </Alert>
      ) : null}
      {typeof sp.archivee === 'string' ? <Alert tone="success">Classe archivée.</Alert> : null}
      {typeof sp.retablie === 'string' ? <Alert tone="success">Classe rétablie.</Alert> : null}
      {typeof sp.lot === 'string' ? (
        <Alert tone={sp.ignorees ? 'info' : 'success'}>
          {sp.faites ?? '0'} classe(s) {sp.lot === 'archive' ? 'archivée(s)' : sp.lot === 'restore' ? 'rétablie(s)' : 'supprimée(s)'}.
          {sp.ignorees ? ` ${sp.ignorees} conservée(s) : ${sp.motif ?? 'action impossible'}` : ''}
        </Alert>
      ) : null}

      <PageHeader
        title="Classes"
        description={`Année ${ctx.academicYear.name} · ${board.counts.active} classe(s) · ${board.counts.students} élève(s)`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <BackToSettings ctx={ctx} />
            <Link href={`/e/${slug}/import?type=classes`}>
              <Button variant="secondary">Importer / exporter</Button>
            </Link>
            {canCreate ? (
              <Link href={`${base}/new`}>
                <Button>Nouvelle classe</Button>
              </Link>
            ) : null}
          </div>
        }
      />

      <nav aria-label="Classes actives ou archivées" className="flex flex-wrap gap-1.5">
        {[
          { key: '', label: 'Actives', count: board.counts.active },
          { key: '1', label: 'Archivées', count: board.counts.archived },
        ].map((t) => {
          const active = (t.key === '1') === archived;
          return (
            <Link
              key={t.label}
              href={t.key ? `${base}?corbeille=1` : base}
              aria-current={active ? 'page' : undefined}
              className="rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
              style={
                active
                  ? { backgroundColor: 'var(--color-brand)', color: 'var(--color-brand-foreground)', borderColor: 'var(--color-brand)' }
                  : { backgroundColor: 'var(--surface)', color: 'var(--muted-foreground)' }
              }
            >
              {t.label} <span className="tabular-nums">{t.count}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <SearchBar
            basePath={base}
            defaultValue={listParams.q}
            placeholder="Rechercher une classe…"
            hidden={{ ...keep, ...(listParams.sort ? { sort: listParams.sort, dir: listParams.dir } : {}) }}
          />
        </div>

      </div>

      <ClassFilters
        basePath={base}
        track={track}
        levelId={levelId}
        tracks={(['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'] as EducationTrack[])
          .filter((t) => tracks.includes(t))
          .map((t) => ({ value: t, label: TRACK_LABELS[t] }))}
        levels={board.levels}
        keep={{
          ...(archived ? { corbeille: '1' } : {}),
          ...(listParams.q ? { q: listParams.q } : {}),
          ...(listParams.sort ? { sort: listParams.sort, dir: listParams.dir } : {}),
        }}
      />

      {canDelete ? (
        <BulkForm
          archived={archived}
          count={rows.length}
          archiveAction={bulkClassesAction.bind(null, slug, 'archive')}
          restoreAction={bulkClassesAction.bind(null, slug, 'restore')}
          deleteAction={bulkClassesAction.bind(null, slug, 'delete')}
        >
          {table}
        </BulkForm>
      ) : (
        table
      )}

    </div>
  );
}
