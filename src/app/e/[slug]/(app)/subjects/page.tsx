import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { parseListParams } from '@/lib/query/list';
import { listSubjects, SUBJECT_SORTABLE, type SubjectRow } from '@/features/subjects/queries';
import { schoolTracks } from '@/features/structure/queries';
import { TRACK_LABELS, type EducationTrack } from '@/features/structure/official-tracks';
import { ProgrammePanel } from '@/features/programme/panel';
import { listLevelProgress, getCoefficientMatrix } from '@/features/programme/board';
import { countFillableSessions } from '@/features/programme/service';
import { LevelProgressList } from '@/features/programme/components/LevelProgressList';
import { CoefficientMatrix } from '@/features/programme/components/CoefficientMatrix';
import { saveMatrixAction, saveSessionsMatrixAction, applyOfficialSessionsAction } from '@/features/programme/actions';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SearchBar } from '@/components/data-table/SearchBar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Matières' };

const TABS = [
  { key: 'matieres', label: 'Liste des matières' },
  { key: 'programme', label: 'Matières par niveau' },
  { key: 'coefficients', label: 'Gestion des coefficients' },
  { key: 'volumes', label: 'Volumes horaires' },
] as const;

/**
 * Deux choses différentes, deux onglets :
 *   « Matières »   la liste de l'établissement (créer, renommer, désactiver) ;
 *   « Programme »  les matières d'un NIVEAU et leur coefficient — c'est là que
 *                  vit le coefficient, parce qu'il change d'un niveau à l'autre
 *                  (maths : 3 en 6ème, 5 en 1ère C).
 */
export default async function SubjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'subjects.view');

  const asked = typeof sp.onglet === 'string' ? sp.onglet : '';
  const tab = (TABS.find((t) => t.key === asked)?.key ?? 'matieres') as (typeof TABS)[number]['key'];
  const base = `/e/${slug}/subjects`;
  const tracks = await schoolTracks(ctx);

  const listParams = parseListParams(sp, { sortable: SUBJECT_SORTABLE, defaultSort: 'name' });
  const { rows, total } = tab === 'matieres' ? await listSubjects(ctx, listParams) : { rows: [], total: 0 };

  // Onglet « Matières par niveau » : où en est chaque niveau.
  const progress = tab === 'programme' ? await listLevelProgress(ctx) : [];
  // Onglet « Gestion des coefficients » : le tableau croisé, filtré par ordre.
  const matrixTrack = typeof sp.ordre === 'string' ? sp.ordre : '';
  const matriceDemandee = tab === 'coefficients' || tab === 'volumes';
  const matrix = matriceDemandee ? await getCoefficientMatrix(ctx, matrixTrack || undefined) : null;
  // Ce que la grille officielle peut RÉELLEMENT remplir : une matière dont le
  // document prévoit zéro séance (la Conduite) n'est pas un manque.
  const emptyVolumes = tab === 'volumes' ? await countFillableSessions(ctx) : 0;
  const canEditProgramme = hasPermission(ctx, 'subjects.update');
  const selectedLevel = typeof sp.level === 'string' ? sp.level : '';


  const columns: Column<SubjectRow>[] = [
    { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="font-mono">{r.code}</span> },
    { key: 'name', header: 'Nom', sortable: true, render: (r) => r.name },
    ...(tracks.length > 1
      ? [
          {
            key: 'tracks',
            header: 'Ordres',
            render: (r: SubjectRow) => (
              <span className="flex flex-wrap gap-1">
                {(r.tracks as EducationTrack[]).map((t) => (
                  <span key={t} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
                    {TRACK_LABELS[t].replace('Enseignement ', '').replace('Formation ', '')}
                  </span>
                ))}
              </span>
            ),
          } satisfies Column<SubjectRow>,
        ]
      : []),
    {
      key: 'is_active',
      header: 'Statut',
      render: (r) =>
        r.is_active ? (
          <span className="text-[color:var(--color-success)]">Active</span>
        ) : (
          <span className="text-[color:var(--muted-foreground)]">Inactive</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Flash searchParams={sp} />
      <PageHeader
        title="Matières"
        description="Les matières de l’école, leur programme par niveau et leurs coefficients."
        action={
          <div className="flex items-center gap-3">
            <BackToSettings ctx={ctx} />
            {tab === 'matieres' && hasPermission(ctx, 'subjects.create') ? (
            <Link href={`${base}/new`}>
              <Button>Nouvelle matière</Button>
            </Link>
            ) : null}
          </div>
        }
      />

      <nav aria-label="Sections des matières" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`${base}?onglet=${t.key}`}
              aria-current={active ? 'page' : undefined}
              className="rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors"
              style={
                active
                  ? { backgroundColor: 'var(--color-brand)', color: 'var(--color-brand-foreground)', borderColor: 'var(--color-brand)' }
                  : { backgroundColor: 'var(--surface)', color: 'var(--muted-foreground)' }
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {typeof sp.enregistres === 'string' ? (
        <Alert tone="success">
          {sp.enregistres} coefficient(s) enregistré(s)
          {sp.retires && sp.retires !== '0' ? `, ${sp.retires} matière(s) retirée(s) d’un niveau` : ''}.
        </Alert>
      ) : null}

      {tab === 'matieres' ? (
        <>
          <SearchBar
            basePath={base}
            defaultValue={listParams.q}
            placeholder="Rechercher par nom ou code…"
            hidden={{ onglet: 'matieres', ...(listParams.sort ? { sort: listParams.sort, dir: listParams.dir } : {}) }}
          />

          <DataTable
            columns={columns}
            rows={rows}
            total={total}
            params={listParams}
            basePath={base}
            searchParams={sp}
            rowHref={hasPermission(ctx, 'subjects.update') ? (r) => `${base}/${r.id}` : undefined}
            emptyLabel="Aucune matière. Créez-en une pour commencer."
          />
        </>
      ) : null}

      {tab === 'programme' ? (
        selectedLevel ? (
          <ProgrammePanel ctx={ctx} slug={slug} sp={sp} basePath={base} keep={{ onglet: 'programme' }} />
        ) : (
          <LevelProgressList basePath={base} levels={progress} tracks={tracks} />
        )
      ) : null}

      {matriceDemandee && matrix ? (
        <div className="space-y-3">
          {tab === 'volumes' ? (
            <>
              {typeof sp.remplies === 'string' ? (
                <Alert tone="success">
                  {sp.remplies} volume(s) repris de la grille officielle. Les volumes que vous aviez déjà saisis n’ont
                  pas été touchés.
                </Alert>
              ) : null}
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Le nombre de cours par semaine, pour toutes les matières et tous les niveaux à la fois. Une séance dure
                ce que dure un créneau de votre grille horaire.
              </p>
              {canEditProgramme && emptyVolumes > 0 ? (
                <div className="rounded-2xl border border-dashed p-3">
                  <p className="mb-2 text-sm">
                    La grille officielle ivoirienne peut renseigner{' '}
                    <span className="font-semibold">{emptyVolumes}</span> matière(s) encore sans séance.
                  </p>
                  <ConfirmSubmit
                    action={applyOfficialSessionsAction.bind(null, slug)}
                    label="Charger les volumes officiels"
                    variant="secondary"
                    confirmMessage="Reprendre les séances de la grille officielle pour les matières qui n’en ont aucune ? Vos volumes déjà saisis ne seront pas modifiés."
                  />
                </div>
              ) : null}
            </>
          ) : null}

          <nav aria-label="Filtrer par ordre" className="flex flex-wrap gap-1.5">
            {[{ value: '', label: 'Tous' }, ...tracks.map((t) => ({ value: t, label: TRACK_LABELS[t as EducationTrack] }))].map(
              (f) => {
                const active = matrixTrack === f.value;
                return (
                  <Link
                    key={f.value || 'tous'}
                    href={`${base}?onglet=${tab}${f.value ? `&ordre=${f.value}` : ''}`}
                    aria-current={active ? 'true' : undefined}
                    className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                    style={
                      active
                        ? { backgroundColor: 'var(--color-brand)', color: 'var(--color-brand-foreground)', borderColor: 'var(--color-brand)' }
                        : { backgroundColor: 'var(--surface)', color: 'var(--muted-foreground)' }
                    }
                  >
                    {f.label}
                  </Link>
                );
              },
            )}
          </nav>

          {tab === 'volumes' ? (
            <CoefficientMatrix
              matrix={matrix}
              action={saveSessionsMatrixAction.bind(null, slug)}
              canEdit={canEditProgramme}
              mode="SEANCES"
            />
          ) : (
            <CoefficientMatrix matrix={matrix} action={saveMatrixAction.bind(null, slug)} canEdit={canEditProgramme} />
          )}
        </div>
      ) : null}

    </div>
  );
}
