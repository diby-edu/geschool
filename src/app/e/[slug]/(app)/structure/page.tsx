import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listCycles, listLevels, schoolTracks } from '@/features/structure/queries';
import { TRACK_LABELS, OFFICIAL_TRACK_LEVELS } from '@/features/structure/official-tracks';
import { groupLevels } from '@/features/structure/level-tree';
import { createCycleAction, deleteCycleAction, createLevelAction, deleteLevelAction, applyOfficialLevelsAction } from '@/features/structure/actions';
import { CycleCreateForm, LevelCreateForm } from '@/features/structure/components/StructureForms';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Structure pédagogique' };

export default async function StructurePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, ['cycles.view', 'levels.view']);

  const [allCycles, allLevels, tracks] = await Promise.all([listCycles(ctx), listLevels(ctx), schoolTracks(ctx)]);
  // L'établissement ne voit que les ordres qu'il a choisis à l'inscription.
  const cycles = allCycles.filter((c) => tracks.includes(c.track));
  const levels = allLevels.filter((l) => tracks.includes(l.track));
  const canCycles = hasPermission(ctx, 'cycles.manage');
  const canLevels = hasPermission(ctx, 'levels.manage');

  // Niveaux officiels proposés pour les ordres de l'établissement, tant qu'il en manque.
  const existingCodes = new Set(allLevels.map((l) => l.code));
  const officialOffers = (['TECHNIQUE', 'PROFESSIONNEL'] as const)
    .filter((t) => tracks.includes(t))
    .map((t) => ({ track: t, missing: OFFICIAL_TRACK_LEVELS[t].levels.filter((l) => !existingCodes.has(l.code)).length }))
    .filter((o) => o.missing > 0);

  // Niveaux rangés par ordre (général, technique, professionnel) puis, dans le
  // professionnel, par diplôme. Repliés par défaut : une école complète en a
  // plus de cinquante.
  const groups = groupLevels(levels);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Flash searchParams={sp} />
      {typeof sp.niveaux === 'string' ? (
        <Alert tone="success">{sp.niveaux} niveau(x) créé(s). Créez maintenant les classes à partir de ces niveaux.</Alert>
      ) : null}
      <PageHeader
        title="Structure pédagogique"
        description="Cycles et niveaux. Les classes sont créées à partir des niveaux."
      action={<BackToSettings ctx={ctx} />}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Cycles</h2>
        {cycles.length === 0 ? (
          <EmptyState title="Aucun cycle" />
        ) : (
          <ul className="space-y-2">
            {cycles.map((c) => (
              <li key={c.id}>
                <Card>
                  <CardContent className="flex items-center justify-between py-3">
                    <span>
                      <span className="font-medium">{c.name}</span>{' '}
                      <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{c.code}</span>
                      <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
                        {TRACK_LABELS[c.track]}
                      </span>
                    </span>
                    {canCycles ? (
                      <ConfirmSubmit
                        action={deleteCycleAction.bind(null, slug, c.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer le cycle « ${c.name} » ?`}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {canCycles ? <CycleCreateForm action={createCycleAction.bind(null, slug)} schoolTracks={tracks} /> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Niveaux</h2>
        {officialOffers.length > 0 && canLevels && canCycles ? (
          <div className="space-y-2">
            {officialOffers.map((o) => (
              <Card key={o.track}>
                <CardContent className="space-y-2 py-4 text-sm">
                  <p className="font-semibold">Niveaux officiels : {TRACK_LABELS[o.track]}</p>
                  <p className="text-[color:var(--muted-foreground)]">
                    {o.track === 'TECHNIQUE'
                      ? 'Crée les séries du technique (2nde AB, B, F1, F2, F3, G1, G2, T3, F7).'
                      : 'Crée les classes de la formation professionnelle, rangées par diplôme (CAP, BEP, BT, CQP, FQ).'}{' '}
                    {o.missing} niveau(x) manquant(s). Ce qui existe déjà n’est pas modifié ; tout reste modifiable ensuite.
                  </p>
                  <ConfirmSubmit
                    action={applyOfficialLevelsAction.bind(null, slug, o.track)}
                    label="Charger les niveaux officiels"
                    variant="secondary"
                    confirmMessage={`Créer les ${o.missing} niveau(x) manquants de l'ordre « ${TRACK_LABELS[o.track]} » ?`}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        {levels.length === 0 ? (
          <EmptyState title="Aucun niveau" hint="Créez d'abord un cycle, puis ajoutez-y des niveaux." />
        ) : (
          groups.map((g) => (
            <details key={g.track} className="rounded-3xl border" style={{ backgroundColor: 'var(--surface)' }}>
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5">
                <span className="text-sm font-bold uppercase tracking-wide">{g.label}</span>
                <span className="text-xs font-semibold tabular-nums text-[color:var(--muted-foreground)]">
                  {g.total} niveau{g.total > 1 ? 'x' : ''}
                </span>
              </summary>
              <div className="space-y-3 px-3 pb-3">
                {g.subs.map((sub) => (
                  <div key={sub.key} className="space-y-2">
                    {sub.label ? (
                      <p className="px-2 pt-1 text-xs font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">
                        {sub.label} <span className="tabular-nums">({sub.levels.length})</span>
                      </p>
                    ) : null}
                    <ul className="space-y-2">
                      {sub.levels.map((l) => (
                        <li key={l.id}>
                          <Card>
                            <CardContent className="flex items-center justify-between py-3">
                              <span>
                                <span className="font-medium">{l.name}</span>{' '}
                                <span className="font-mono text-xs text-[color:var(--muted-foreground)]">{l.code}</span>
                                {l.cycle_name ? (
                                  <span className="text-xs text-[color:var(--muted-foreground)]"> · {l.cycle_name}</span>
                                ) : null}
                              </span>
                              {canLevels ? (
                                <ConfirmSubmit
                                  action={deleteLevelAction.bind(null, slug, l.id)}
                                  label="Supprimer"
                                  variant="secondary"
                                  confirmMessage={`Supprimer le niveau « ${l.name} » ?`}
                                />
                              ) : null}
                            </CardContent>
                          </Card>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          ))
        )}
        {canLevels && cycles.length > 0 ? (
          <LevelCreateForm
            action={createLevelAction.bind(null, slug)}
            cycles={cycles.map((c) => ({ id: c.id, name: c.name, track: c.track }))}
          />
        ) : null}
      </section>
    </div>
  );
}
