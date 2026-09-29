import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getAssignmentGrid, listGridLevels } from '@/features/assignments/grid';
import { listAssignments } from '@/features/assignments/queries';
import { AssignmentGrid } from '@/features/assignments/components/AssignmentGrid';
import { LevelChooser } from '@/features/assignments/components/LevelChooser';
import { carryOverAction, saveGridAction, deleteAssignmentAction } from '@/features/assignments/actions';
import { TRACK_LABELS, type EducationTrack } from '@/features/structure/official-tracks';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Affectations' };

const TABS = [
  { key: 'grille', label: 'Grille des affectations' },
  { key: 'liste', label: 'Vue liste' },
] as const;

const hm = (minutes: number) => (minutes > 0 ? `${Math.round((minutes / 60) * 10) / 10} h` : '—');

/**
 * Qui enseigne quoi, à quelle classe.
 *
 * La grille remplace le formulaire d'autrefois : on choisit un niveau, et l'on
 * remplit ses classes et ses matières d'un seul écran. La vue liste reste pour
 * retrouver une affectation précise ou en retirer une.
 */
export default async function AssignmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'assignments.view');

  const base = `/e/${slug}/assignments`;
  const canManage = hasPermission(ctx, 'assignments.manage');

  if (!ctx.academicYear) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Affectations d’enseignement" action={<BackToSettings ctx={ctx} />} />
        <EmptyState
          title="Aucune année scolaire active"
          hint="Activez une année pour gérer les affectations."
          action={{ href: `/e/${slug}/academic-years`, label: 'Gérer les années scolaires' }}
        />
      </div>
    );
  }

  const tab = (TABS.find((t) => t.key === sp.onglet)?.key ?? 'grille') as (typeof TABS)[number]['key'];
  const levelId = typeof sp.niveau === 'string' ? sp.niveau : '';

  const [levels, grid, listRows] = await Promise.all([
    listGridLevels(ctx),
    tab === 'grille' && levelId ? getAssignmentGrid(ctx, levelId) : Promise.resolve(null),
    tab === 'liste' ? listAssignments(ctx, ctx.academicYear.id) : Promise.resolve([]),
  ]);
  const level = levels.find((l) => l.id === levelId);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Flash searchParams={sp} />
      <PageHeader
        title="Affectations d’enseignement"
        description={`Qui enseigne quoi, à quelle classe · ${ctx.academicYear.name}`}
        action={<BackToSettings ctx={ctx} />}
      />

      {typeof sp.crees === 'string' ? (
        <Alert tone="success">
          {sp.crees} affectation(s) créée(s)
          {sp.changes && sp.changes !== '0' ? `, ${sp.changes} enseignant(s) remplacé(s)` : ''}
          {sp.retires && sp.retires !== '0' ? `, ${sp.retires} retirée(s)` : ''}.
        </Alert>
      ) : null}
      {typeof sp.reconduites === 'string' ? (
        <Alert tone={sp.reconduites === '0' ? 'info' : 'success'}>
          {sp.reconduites === '0'
            ? 'Rien à reconduire : aucune affectation de l’année précédente ne correspond aux classes actuelles.'
            : `${sp.reconduites} affectation(s) reprises de l’année précédente.`}
        </Alert>
      ) : null}

      <nav aria-label="Sections des affectations" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={t.key === 'grille' ? base : `${base}?onglet=liste`}
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

      {tab === 'grille' ? (
        <>
          <LevelChooser basePath={base} levels={levels} selected={levelId} />

          {!levelId ? (
            <EmptyState
              title="Choisissez un niveau"
              hint="La grille affiche alors ses classes en lignes et les matières de son programme en colonnes."
            />
          ) : grid ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  {level ? `${level.name} · ${TRACK_LABELS[level.track as EducationTrack] ?? level.track}` : ''}
                </p>
                {canManage ? (
                  <ConfirmSubmit
                    action={carryOverAction.bind(null, slug, levelId)}
                    label="Reconduire l’année précédente"
                    variant="secondary"
                    confirmMessage="Reprendre les affectations de l’année précédente pour ce niveau ? Les classes de même code retrouvent leurs enseignants ; ce qui est déjà saisi est remplacé."
                  />
                ) : null}
              </div>

              <AssignmentGrid grid={grid} action={saveGridAction.bind(null, slug, levelId)} canEdit={canManage} />
            </>
          ) : null}
        </>
      ) : listRows.length === 0 ? (
        <EmptyState title="Aucune affectation" hint="Remplissez la grille, niveau par niveau." />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[color:var(--muted-foreground)]">
                  <th className="px-4 py-3 font-medium">Classe</th>
                  <th className="px-4 py-3 font-medium">Matière</th>
                  <th className="px-4 py-3 font-medium">Enseignant</th>
                  <th className="px-4 py-3 text-right font-medium">Volume</th>
                  {canManage ? <th className="px-4 py-3" /> : null}
                </tr>
              </thead>
              <tbody>
                {listRows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{r.klass}</td>
                    <td className="px-4 py-2">{r.subject}</td>
                    <td className="px-4 py-2">{r.teacher}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{hm(r.weekly_minutes)}</td>
                    {canManage ? (
                      <td className="px-4 py-2 text-right">
                        <ConfirmSubmit
                          action={deleteAssignmentAction.bind(null, slug, r.id)}
                          label="Retirer"
                          variant="secondary"
                          confirmMessage={`Retirer ${r.teacher} de ${r.subject} en ${r.klass} ?`}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
