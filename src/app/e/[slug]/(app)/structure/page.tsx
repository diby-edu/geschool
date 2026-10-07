import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listCycles, listLevels, schoolTracks } from '@/features/structure/queries';
import { TRACK_LABELS, OFFICIAL_STRUCTURE, type EducationTrack } from '@/features/structure/official-tracks';
import { groupLevels } from '@/features/structure/level-tree';
import { createCycleAction, deleteCycleAction, createLevelAction, deleteLevelAction, applyOfficialLevelsAction } from '@/features/structure/actions';
import { CycleCreateForm, LevelCreateForm } from '@/features/structure/components/StructureForms';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { BackToSettings } from '@/features/settings/components/BackToSettings';
import { fromStartup, suiteValue } from '@/features/onboarding/suite';
import { StartupTrail } from '@/features/onboarding/components/StartupTrail';

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
  // Ce qui manque encore a chaque ordre souscrit, cycles ET niveaux. Le general
  // y figure desormais : ses deux cycles et ses quatorze niveaux sont connus
  // d'avance, il n'y a aucune raison de les faire saisir a la main.
  const existingCycleCodes = new Set(allCycles.map((c) => c.code));
  const officialOffers = (['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL'] as const)
    .filter((t) => tracks.includes(t))
    .map((t) => ({
      track: t as EducationTrack,
      missingCycles: OFFICIAL_STRUCTURE[t].cycles.filter((c) => !existingCycleCodes.has(c.code)).length,
      missing: OFFICIAL_STRUCTURE[t].levels.filter((l) => !existingCodes.has(l.code)).length,
    }))
    .filter((o) => o.missing > 0 || o.missingCycles > 0);

  // Niveaux rangés par ordre (général, technique, professionnel) puis, dans le
  // professionnel, par diplôme. Repliés par défaut : une école complète en a
  // plus de cinquante.
  const groups = groupLevels(levels);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Flash searchParams={sp} />
      {fromStartup(sp) ? <StartupTrail slug={slug} step={3} total={10} label="les cycles et les niveaux" /> : null}
      {typeof sp.niveaux === 'string' ? (
        <Alert tone="success">
          {sp.cycles && sp.cycles !== '0' ? `${sp.cycles} cycle(s) et ` : ''}
          {sp.niveaux} niveau(x) créé(s). Créez maintenant les classes à partir de ces niveaux.
        </Alert>
      ) : null}
      <PageHeader
        title="Structure pédagogique"
        description="Cycles et niveaux. Les classes sont créées à partir des niveaux."
      action={<BackToSettings ctx={ctx} />}
      />

      {officialOffers.length > 0 && canLevels && canCycles ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Partir de la structure officielle
          </h2>
          <div className="space-y-2">
            {officialOffers.map((o) => (
              <Card key={o.track}>
                <CardContent className="space-y-2 py-4 text-sm">
                  <p className="font-semibold">Structure officielle : {TRACK_LABELS[o.track]}</p>
                  <p className="text-[color:var(--muted-foreground)]">
                    {o.track === 'GENERAL'
                      ? 'Crée le premier et le second cycle, puis la 6ème à la Terminale (séries A, C, D).'
                      : o.track === 'TECHNIQUE'
                        ? 'Crée les séries du technique (2nde AB, B, F1, F2, F3, G1, G2, T3, F7).'
                        : 'Crée les classes de la formation professionnelle, rangées par diplôme (CAP, BEP, BT, CQP, FQ).'}{' '}
                    {o.missingCycles > 0 ? `${o.missingCycles} cycle(s) et ` : ''}
                    {o.missing} niveau(x) manquant(s). Ce qui existe déjà n’est pas modifié ; tout reste modifiable ensuite.
                  </p>
                  <ConfirmSubmit
                    action={applyOfficialLevelsAction.bind(null, slug, o.track)}
                    {...(suiteValue(sp) ? { hidden: { suite: suiteValue(sp)! } } : {})}
                    label="Charger la structure officielle"
                    variant="secondary"
                    confirmMessage={`Créer ce qui manque à l'ordre « ${TRACK_LABELS[o.track]} » ?`}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">Cycles</h2>
        {cycles.length === 0 ? (
          <EmptyState
            title="Aucun cycle"
            hint="Chargez la structure officielle de votre ordre d’enseignement ci-dessous : les cycles et les niveaux sont déjà connus."
          />
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

        {levels.length === 0 ? (
          <EmptyState title="Aucun niveau" hint="Créez d'abord un cycle, puis ajoutez-y des niveaux." />
        ) : (
          groups.map((g) => (
            <details key={g.track} className="group rounded-3xl border" style={{ backgroundColor: 'var(--surface)' }}>
              {/* Replie par defaut : une ecole complete depasse la cinquantaine
                  de niveaux. Le chevron dit que le bloc s'ouvre. */}
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5">
                <span className="flex items-center gap-2">
                  <ChevronRight
                    className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    aria-hidden
                  />
                  <span className="text-sm font-bold uppercase tracking-wide">{g.label}</span>
                </span>
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
